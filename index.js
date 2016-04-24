'use strict'

var url = 'mongodb://localhost:27017/domain';
var MongoClient = require('mongodb').MongoClient;
const googleBrandSearch = require('./googlebrand.js');

MongoClient.connect(url, function(err, db) {
  if(err) throw err;
  var cursorStub = {
    each: function(cb) {
      cb(null, this.data.pop())
    },
    data: []
  };
  var proxyStub = {
      push: function(el) {
        this.data.push(el);
      },
      exists: function(el) {
        let r = this.data.find(function(f) { 
          return f == el
        })
        return r === undefined ? 0 : 1;
      },
      data: []
  };

  var defaultProxy = '127.0.0.1:8081'
  var defaultDomain = {
    domain: 'sitename.com',
  }
  var settings = { 
    getGoodProxy: function() {
      return null;
    },
    getAvailableProxy: function(el) {
      return new Promise(function(resolve, reject) {
        setTimeout(function() {
          resolve(defaultProxy, -1);
        }, 100);
      })
      return defaultProxy
    },
    badProxyLists: Object.create(proxyStub),
    secondaryProxyLists: Object.create(proxyStub)
  };
  let gb = googleBrandSearch.create({
    db: db,
    //settings: settings
  })
  gb.getMoreDomains()
})
