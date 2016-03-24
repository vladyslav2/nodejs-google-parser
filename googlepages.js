'use strict'

var ObjectId = require('mongodb').ObjectID;
var request = require('request');
var settings = require('./settings.js');

var domainInProgress = [];
var domainPerStep = 5000;
var gettingDomains = 0;
var positiveDomains = 0;
var successRequestCount = 0;
var db = null;


var GetMoreDomains = function() {
  //will get domains from database and will join with available proxy server
  //for checking in google.com

  //since we have a lot more domains that proxies
  //we will not allow system to run that function more that once
  //otherwise our process just get all domains from database and will stuck
  if(gettingDomains == 0) {
    gettingDomains = 1;
    (function(gettingDomains) {
      db.collection('domains').find({'google_indexed_pages': -1}, {'domain': 1}, {limit: domainPerStep}, function newDomains(err, cursor) {
        if(err) throw err;
        cursor.each(function(err, el) {
          if(err) throw err;
          if(el) {

            if(settings.debug == true)
              console.log('Trying to find proxy for domain ' + el.domain);

            settings.get_available_proxy(el);
          }
          else {
            gettingDomains = 0;
          }
        })
      })
    })(gettingDomains);
  }
}

var GooglePagesSearch = function(domain, proxy, attemps) {
  // Will get search result count for the domain
  // Main problem 90% are already blocked by google
  // So we have to make sure that we got correct google answer on our request
  //
  // On incorrect answer we will give 3 attemps to previously working proxy
  // and only one attemp to new one
  //
  // For getting only english results for England region we will make request to
  // google.co.uk with hl=en variable
  //

  request.get({
    method: 'GET',
    uri: 'https://google.co.uk/search?q=site:' + domain.domain + '&hl=en',
    gzip: true,
    jar: true,
    proxy: proxy,
  }, function(error, response, body) {
    // Make sure that we got answer from google, not ads  or trash from proxy 
    if(response.request.host.indexOf('google') >= 0) {
      successRequestCount ++;
      if(error) {
        // If error happens
        // Worked proxy will have 3 attems before get banned, new proxy will be banned at once
        if(attemps > 3 || attemps == -1) { // Give 3 atterms to proxy if that was working before
          settings.badProxyLists.push( function catchedBadProxy(err, result) {
            redis_client.setex(proxy, 60*60*3, function savedBadProxy(err, result) {
              settings.get_available_proxy(res, domainInProgress, GetMoreDomains,  GooglePagesSearch);
            })
          })
        } else {
          ++ attemps;
          setTimeout(function() { 
            GooglePagesSearch(domain, proxy, attemps) 
          }, 500); 
        }
      }
      else {

        if(settings.debug == true)
          console.log('Success google request for domain ' + domain.domain);

        // Check if we got real results, not google captcha
        if(body.indexOf('please type the characters below') == -1) {

          if(settings.debug == true)
            console.log('Worked proxy server for google request ' + proxy.url);

          // ToDo
          // code for google parsing
        } else {
          settings.secondaryProxyLists.push(proxy);
          settings.get_available_proxy(domain, domainInProgress, GetMoreDomains, GooglePagesSearch);
          return 0;
        }
      }
    }
  })

}


// Step list: 
// 1. Get 100 domains
// 2. Get 100 proxies
// 3. Check domains
// 4. Go to 1 till domains are exist

exports.run = function(mdb) {
  db =  mdb;
  db.collection('domains').count({'google_indexed_pages': -1}, function(err, count) {
    if(err) throw err;
    if(count > 0) {
      GetMoreDomains();
    }
    else if(settings.debug == true) {
      console.log('Domains for google pages search not found');
      process.exit();
    }
  })
}
