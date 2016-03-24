'use strict'

var domainInProgress = [];
var domainPerStep = 5000;
var gettingDomains = 0;
var positiveDomains = 0;
var successRequestCount = 0;
var google_brand_params = [];
var request = require('request');
var ObjectId = require('mongodb').ObjectID;
var cheerio = require('cheerio');
var db = null;
var settings = require('./settings.js');


var checkIfAllDomainsChecked = function() {
  // Write pool state and close a program if all domains
  // are checked

  db.collection('domains').find({'google_brand_checked': -1}).count(function(err, count) {
    if(count == 0) {
      db.collection('pools').insert({
        '_cls': 'Pools', 
        'task': 'googlebrand.js', 
        'status': 2, 
        'finished': new Date(), 
       }, function(err, data) {
        process.kill();
      })
    }
  })
}

var getsMoreGoogleBrandDomains = function() {
  // Get new domains for check

  if(gettingDomains == 0) {
    gettingDomains = 1;
    (function(gettingDomains) {

      db.collection('domains').find({'google_brand_checked': -1}, {'domain': 1}, {limit: domainPerStep}, function(err, cursor) {
      //db.collection('domains').find({}, {'domain': 1}, {limit: domainPerStep}, function(err, cursor) {
        if(err) throw err;
        cursor.each(function(err, el) {
          if(err) throw err;
          if(el) {
            if(false == domainInProgress.filter(function(d, i) { if(d) return d.domain == el.domain})) {
              settings.getAvailableProxy(el, domainInProgress, getsMoreGoogleBrandDomains, GoogleBrandSearch);
            }
          }
          // when each is finished
          else {
            gettingDomains = 0;
          }
        })
      })
    })(gettingDomains);
  }
}

function ctext(html) {
  var $ = cheerio.load(html);
  var values = [];

  for(var i = 0; i < google_brand_params.length; i++) {
    var param = google_brand_params[i];

    if($('' + param['tag'] + '[' + param['attribute'] + param['search'] + '="' + param['value'] + '"]').length != 0)
      values.push(i);
  }

  return values;
}

var GoogleBrandSearch = function(res, proxy, attemps) {
  // Function Will do a proxy request and check if we get correct answer 
  // from google

  var proxy_array = proxy.split(':');

  request.get({
    method: 'GET',
    uri: 'https://google.co.uk/search?q=' + res.domain.split('.')[0] + '&hl=en',
    gzip: true,
    jar: true,
    proxy: {protocol: proxy_array[0] + ':', hostname: proxy_array[1], 'port': proxy_array[2]},
  }, function(error, response, body) {
    successRequestCount ++;
    if(error) {
      if(attemps > 3 || attemps == -1) { // Give 3 atterms to proxy if that was working before
        settings.badProxyLists.push(proxy, function(err, result) {
          redis_client.setex(proxy, 60*60*3, function(err, result) {
            settings.getAvailableProxy(res, domainInProgress, getsMoreGoogleBrandDomains,  GoogleBrandSearch);
          })
        })
      } else {
        ++ attemps;
        setTimeout(function() { GoogleBrandSearch(res, proxy, attemps) }, 1000); 
      }
    }
    else {
      if(settings.debut == true)
        console.log('worked proxy ', proxy, '');

      if(response.request.host.indexOf('google') >= 0) {
        if(body.indexOf('please type the characters below') == -1) {
          var ss = 0,
              values = ctext(body);
          values.map(function(el, i){  ss += Math.pow(2, el)});

          db.collection('domains').update({
            '_id': ObjectId(res._id),
          }, {'$set': {
            'google_brand_result': body,
            'google_brand_checked': 1,
            'google_brand_value': ss,
            'google_brand_values': values
          }}, function(err, result) {
            if(settings.debut == true)
              console.log('worked request ', res.domain, '');

            settings.goodProxyLists.push(proxy);
            if(domainInProgress.length == 0) {
              getsMoreGoogleBrandDomains();
              setTimeout(function() {
                  checkIfAllDomainsChecked()
              }, 60000);
            }
            else {
              res = domainInProgress.pop();
              GoogleBrandSearch(res, proxy, 0);
            }
          });
        } else {
          settings.secondaryProxyLists.push(proxy);
          //redis_command(3, save_secondary_proxy); 
        }
      } else {
        settings.secondaryProxyLists.push(proxy);
        settings.getAvailableProxy(res, domainInProgress, getsMoreGoogleBrandDomains, GoogleBrandSearch);
        return 0;
      }
    }
  })
}


exports.run = function(mdb) {
  db =  mdb;
  // 1. Get 100 domains
  // 2. Get 100 proxies
  // 3. Check domains
  // 4. Go to 1 till domains are exist
  settings.set_main_database(db);
  db.collection('settings').find({'name': 'GoogleBrandSearch'}, function(err, cursor) {
    if(err) throw err;

    cursor.each(function(err, el) {
      if(err) throw err;
      if(el) {
        google_brand_params = el['params'];
      }
      // when each was finish
      else {
        db.collection('pools').insert({
          '_cls': 'Pools', 
          'task': 'googlebrand.js', 
          'status': 0, 
          'started': new Date(), 
         }, function(err, data) {
        })
        getsMoreGoogleBrandDomains();
      }
    })
  })
}
