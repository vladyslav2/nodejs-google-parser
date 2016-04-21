'use strict'

const request = require('request');
const ObjectId = require('mongodb').ObjectID;
const cheerio = require('cheerio');

class GoogleBrandSearch {

  constructor(options) {
    this.domainInProgress = [];
    this.domainPerStep = 5000;
    this.gettingDomains = 0;
    this.positiveDomains = 0;
    this.successRequestCount = 0;
    this.googleSearchFor = [];
    this.db = options.db;
    this.settings = options.settings;
    this.successRequestCount = 0;

    this.db.collection('settings').find({ name: 'google_brand_search' }, (err, cursor) => {
      if (err) throw err;

      console.log('we got new search');
      cursor.each((err, el) => {
        if (err) throw err;
        if (el) {
          this.googleSearchFor = el.params;
        } else {
          this.db.collection('pools').insert({
            _cls: 'Pools',
            task: 'googlebrand.js',
            status: 0,
            started: new Date(),
          }, function (err, data) {
            if (err) throw err;
          });
        }
      });
    });
  }

  checkIfAllDomainsChecked() {
    this.db.collection('domains').find({ google_brand_checked: -1 }).count(function (err, count) {
      if (count == 0) {
        this.db.collection('pools').insert({
          _cls: 'Pools',
          task: 'googlebrand.js',
          status: 2,
          finished: new Date(),
        }, function (err, data) {
          process.kill();
        });
      }
    });
  }

  getMoreDomains() {
    if (this.gettingDomains == 0) {
      this.gettingDomains = 1;
      this.db.collection('domains').find(
          { google_brand_checked: -1 },
          { domain: 1 },
          { limit: this.domainPerStep }, (err, cursor) => {
        if (err) throw err;
        cursor.each((err, el) => {
          if (err) throw err;
          if (el) {
            // ToDo
            // Rewrite that if condition
            if (false == this.domainInProgress.filter(
                function (d, i) {
                  return d.domain == el.domain;
                })
              ) {
              this.settings.getAvailableProxy(
                el,
                this
              );
            }
          } else {
            this.gettingDomains = 0;
          }
        });
      });
    }
  }

  ctext(html) {
    var $ = cheerio.load(html);
    var values = [];

    for (var i = 0; i < this.googleSearchFor.length; i++) {
      var param = this.googleSearchFor[i];

      if ($('' + param.tag + '[' + param.attribute + param.search + '="' + param.value + '"]').length != 0)
        values.push(i);
    }

    return values;
  }

  getDomainInfo(res, proxy, attemps) {

    /* Function Will do a proxy request and check if we get correct answer 
     * from google
    */

    // Our nodejs version does not allow to do this
    // const {protocol, hostname, port} = proxy.split(':');
    const protocol = proxy.split(':')[0];
    const hostname = proxy.split(':')[1];
    const port     = proxy.split(':')[2];

    request.get({
      method: 'GET',
      gzip: true,
      uri: 'https://google.co.uk/search?q=' + res.domain.split('.')[0] + '&hl=en',
      jar: true,
      proxy: { protocol: protocol + ':', hostname: hostname, port: port },
    }, (error, response, body) => {
      if (error) {
        if (this.settings.debugFail) console.log('got error for proxy ', proxy);

        // Give 3 atterms to proxy if that was working before
        // Or only one attemps if its new one
        if (attemps > 3 || attemps == -1) {
          this.settings.badProxyLists.push(proxy, (err, result) => {
            if (err) throw err;
            this.redisClient.setex(proxy, 10800, (err, result) => {
              if (err) throw err;
              this.settings.getAvailableProxy(
                res,
                this
              );
            });
          });
        } else {
          attemps++;

          // Some proxies will block us if we will made too many request
          // So we will use that proxy but with 1 sec delay
          setTimeout(() => { this.getDomainInfo(res, proxy, attemps); }, 1000);
        }
      } else {
        this.successRequestCount++;
        if (this.settings.debut == true)
          console.log('worked proxy ', proxy, '');

        if (response.request.host.indexOf('google') >= 0) {
          if (body.indexOf('please type the characters below') == -1) {
            var ss = 0;
            var values = this.ctext(body);
            values.map(function (el, i) { ss += Math.pow(2, el);});

            this.db.collection('domains').update({
              _id: ObjectId(res._id),
            }, { $set: {
              google_brand_result: body,
              google_brand_checked: 1,
              google_brand_value: ss,
              google_brand_values: values,
            }, }, (err, result) => {
              if (err) throw err;
              if (this.settings.debug == true) console.log('worked request ', res.domain);

              this.settings.goodProxyLists.push(proxy);
              if (this.domainInProgress.length == 0) {
                this.getMoreDomains();
                setTimeout(() => {
                  this.checkIfAllDomainsChecked();
                }, 60000);
              } else {
                res = this.domainInProgress.pop();
                this.getDomainInfo(res, proxy, 0);
              }
            });
          } else {
            this.settings.secondaryProxyLists.push(proxy);
          }
        } else {
          this.settings.secondaryProxyLists.push(proxy);
          this.settings.getAvailableProxy(
            res,
            this
          );
          return 0;
        }
      }
    });
  }
}

function create(options) {
  // We will use factory patters with dependency injection
  if (options.hasOwnProperty('setttings') == false) {
    const settings = require('./settings.js');
    settings.setMainDatabase(options.db);
    options.settings = settings;
  }

  return new GoogleBrandSearch(options);
}

exports.create = create;
