'use strict'
var chai     = require('chai');
var sinon    = require('sinon');
var should   = chai.should();
var expect   = chai.expect;
var fs       = require('fs');
var request  = require('request');
chai.use(require('sinon-chai'));
var GoogleBrandSearch = require('../googlebrand');

var defaultProxy = '127.0.0.1:8081'
var defaultDomain = {
  domain: 'sitename.com',
}

describe('Google Parser Tests', function() {
  beforeEach(function() {
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

    this.settings = { 
      getGoodProxy: function() {
        return null;
      },
      getAvailableProxy: function(el, service) {
        return defaultProxy
      },
      badProxyLists: Object.create(proxyStub),
      secondaryProxyLists: Object.create(proxyStub)
    };
    this.db = {
      collection: function(name) {
        return {
          find: function(params, cb) {
            var res = Object.create(cursorStub);
            if (name == 'domains') {
              res.data = [{domain: '123.com'}, {domain: 'sitename.com'}]
              arguments[3](null, res);
            }
            else if (name == 'settings') {
            }
        }}
      }
    };
    this.gp = GoogleBrandSearch.create({
      settings: this.settings,
      db: this.db
    });
    this.gp.googleSearchFor = [
      {
        "attribute" : "src",
        "search" : "*",
        "tag" : "img",
        "value" : "/maps/vt/"
      },
      {
        "search" : "*",
        "tag" : "",
        "attribute" : "class",
        "value" : "kno-ecr-pt"
      },
      {
        "search" : "*",
        "tag" : "a",
        "attribute" : "href",
        "value" : "facebook.com"
      }
    ]
  });
  it('Get More Domain Check' , function() {
    const availableProxyStub = sinon.stub(this.settings, "getAvailableProxy", function() {
      return '127.0.0.1:8081'
    });
    this.gp.getMoreDomains();
    availableProxyStub.called.should.be.true;
    availableProxyStub.restore();
  });
  it('Custom Search Flags', function() {
    var html = fs.readFileSync('test/content/google_brand_1.html', 'utf8');
    this.gp.searchCustomFlags(html).should.eql([]);
    html = fs.readFileSync('test/content/google_brand_map.html', 'utf8')
    this.gp.searchCustomFlags(html).should.eql([ 0 ]);
    html = fs.readFileSync('test/content/google_brand_fb.html', 'utf8')
    this.gp.searchCustomFlags(html).should.eql([ 2 ]);
  });
  it('Parse Domain with bad Proxy', function() {
    let requestStub = sinon.stub(request, 'get').yields(
      {'err': 'Bad proxy test'}, 
      {statusCode: 200},
      'foo'
    );    
    let getAvailableProxySub  = sinon.stub(this.settings, 'getAvailableProxy', function() {
      return defaultProxy
    }); 
    this.gp.getDomainInfo(defaultDomain, defaultProxy, -1)
    requestStub.called.true;
    getAvailableProxySub.called.true;
    this.settings.badProxyLists.exists(defaultProxy).should.eql(1);
    requestStub.restore();
    getAvailableProxySub.restore();
  });
  it('Parse Domain with google baned Proxy', function() {
    let requestStub = sinon.stub(request, 'get').yields(
      null, 
      {statusCode: 200, request: {host: 'google.co.uk'}},
      'please type the characters below'
    );    
    let getAvailableProxySub  = sinon.stub(this.settings, 'getAvailableProxy', function() {
      return defaultProxy
    }); 
    this.gp.getDomainInfo(defaultDomain, defaultProxy, -1)
    requestStub.called.true;
    getAvailableProxySub.called.true;
    this.settings.secondaryProxyLists.exists(defaultProxy).should.eql(1);
  });
});
