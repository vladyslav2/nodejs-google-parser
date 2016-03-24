'use strict'

var proxy_pattern = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b:\d{2,5}/g

var current_database = 0;
var redis = require('redis');
var redis_client = redis.createClient();
var parsingProxySite = 0;
var request = require('request');
var ObjectId = require('mongodb').ObjectID;
var debug = true;
var db = null;

var settings = {};
settings.debug = debug;

redis_client.on("error", function (err) {
    console.log("Error " + err);
    process.exit();
});
  
var goodProxyLists = {
    pop: function() {
      throw 'No pop for bad proxies';
    },

    push: function(el, callback) {
      return redis_command(1, redis_client.set, el, 1,  function(err, res) {
        if(err) throw err;
        return res;
      });
    },

    get: function(el, callback) {
      return redis_command(1, redis_client.exists, el, function(err, res) {
        if(err) throw err;
        callback(res);
      });
    },

    random: function(callback) {
      return redis_command(1, redis_client.randomkey, function(err, res) {
        if(err) throw err;
        callback(res);
        /*
        ToDo
        Delete good proxy only after N failed times
        redis_client.del(res, function(err, result) {
          if(err) throw err;
          callback(res);
        }) 
        */
      });
    },
}

var badProxyLists = {
    pop: function() {
      throw 'No pop for bad proxies';
    },

    push: function(el, callback) {
      return redis_command(2, redis_client.setex, el, 1, 60*60*300, function(err, res) {
        if(err) throw err;
        return res;
      });
    },

    get: function(callback) {
      return redis_command(2, redis_client.randomkey, function(err, res) {
        if(err) throw err;
        callback(res);
      });
    },

    exists: function(el, callback) {
      return redis_command(2, redis_client.exists, el, function(err, res) {
        if(err) throw err;
        callback(res);
      });
    }
}

var notCheckedLists = {
    pop: function() {
      throw 'No pop for not checked proxies';
    },

    push: function(el) {
      return redis_command(5, redis_client.set, el, 1,  function(err, res) {
        if(err) throw err;
        return res;
      });
    },

    random: function(callback) {
      return redis_command(5, redis_client.randomkey, function(err, res) {
        if(err) throw err;
        if(res !== null) {
          redis_client.del(res, function(err, result) {
            if(err) throw err;
            callback(res);
          }) 
        }
        else {
          if(settings.debug == true) {
            //console.log('Not found any proxy for check')
          }
          callback(null);
        }
      });
    },

    get: function(callback) {
      return redis_command(5, redis_client.randomkey, function(err, res) {
        if(err) throw err;
        callback(res);
      });
    }
}

var secondaryProxyLists = {
    pop: function() {
      throw 'No pop for not checked proxies';
    },

    push: function(el) {
      return redis_command(3, redis_client.set, el, 1, function(err, res) {
        if(err) throw err;
        return res;
      });
    },

    random: function(callback) {
      return redis_command(3, redis_client.randomkey, function(err, res) {
        if(err) throw err;
        redis_client.del(res, function(err, result) {
          if(err) throw err;
          callback(res);
        }) 
      });
    },

    get: function(callback) {
      return redis_command(3, redis_client.randomkey, function(err, res) {
        if(err) throw err;
        callback(res);
      });
    }
}

var redis_command = function(database_number, callback)  {
  var args = [];
  for(var i = 2; i < arguments.length; i++)
    args.push(arguments[i])

  if(database_number != current_database) {
    redis_client.select(database_number, function(error, response) {
      if(error) throw error;
      current_database = database_number;
      return callback.apply(redis_client, args);
    })
  }
  else {
    return callback.apply(redis_client, args);
  }
}

var getSecondaryProxy = function(callback, proxysite_url, attemps, get_more_domains, parsing_function) {
  secondaryProxyLists.random(function(result) {
      if(result === null) {
        notCheckedLists.random(function(result) {
          if(result === null) {
            if(attemps == 50) { throw 'No secondary proxies'; process.exit(); }
            setTimeout(function() {
              getSecondaryProxy(callback, proxysite_url, ++attemps, get_more_domains, parsing_function);
            }, 1000)
            return 0;
          } else {
            callback(proxysite_url, result, get_more_domains, parsing_function);
          }
        })
      } 
      else {
        callback(proxysite_url, result, get_more_domains, parsing_function);
      }
  })
}

var getAvailableProxy = function(res, domainInProgress, get_more_domains, parsing_function) {
  goodProxyLists.random(function(proxy) {
    if(proxy === null) {
      notCheckedLists.random(function(proxy) {
        if(proxy !== null) {

          if(settings.debug == true)
            console.log('Found proxy in new proxy list ', proxy);

          parsing_function(res, proxy, -1);
        }  else {
          domainInProgress.push(res);
          parseProxySite(get_more_domains, parsing_function);
          setTimeout(function() { 
            getAvailableProxy(res, domainInProgress, get_more_domains, parsing_function);
          }, 3000);
          //domainInProgress.push(res);
        }
      })
    }
    else {

      if(settings.debug == true)
        console.log('Found proxy in good proxy list', proxy);

      parsing_function(res, proxy, 0);
    }
  })
}

var parseProxySite = function(get_more_domains, parsing_function)  {
  // Will get proxy site url from database and will try
  // to parse it with parsing_function
  // in success will run get_more_domains function
  // otherwise will try other proxy url after 2500 milseconds

  if(parsingProxySite < 1) {
    parsingProxySite = 1;
    (function(parsingProxySite) {
      var d = new Date();
      d.setTime(d - 60000);
      db.collection('proxylist').find({'last_grabbed': {'$lte': d}}, {}, {sort: {'last_grabbed': 1}, limit: 10}, function(err, cursor) {
        if(err) throw err;
        cursor.each(function(err, el) {
          if(err) throw err;
          if(el) {

            if(settings.debug == true)
              console.log('get proxy for parsing', el.proxy_url, el.last_grabbed);

            db.collection('proxylist').update({'_id': ObjectId(el['_id'])}, {'$set': {'last_grabbed': new Date()}}, function(err, res) {
              setTimeout(function() { parsingProxySite --;}, 2500);
              //getSecondaryProxy(parseProxyUrlPage, el.proxy_url, 1, get_more_domains, parsing_function);
              parseProxyUrlPage(el.proxy_url, '', get_more_domains, parsing_function);
            });
          }
          else {
          }  
        })
      })
    })(parsingProxySite)
  }
}

var parseProxyUrlPage = function (page_url, secondary_proxy, get_more_domains, parsing_function) {
  var proxy_array = secondary_proxy.split(':')

  if(settings.debug == true)
    console.log('request proxysite ', page_url, ' ', secondary_proxy);

  request.get({
    method: 'GET',
    uri: page_url,
    gzip: true,
    //proxy: {protocol: proxy_array[0] + ':', hostname: proxy_array[1], 'port': proxy_array[2]},
  }, function(error, response, body) {
    if(error) {
      getSecondaryProxy(parseProxyUrlPage, page_url, 1, get_more_domains, parsing_function);
      return 0;
    } else {
      secondaryProxyLists.push(secondary_proxy);
      var ips = body.match(proxy_pattern);
      if(settings.debut == true) {
        if(ips) 
          console.log(page_url, ' ips count: ', ips.length);
        else console.log(page_url, 'ips count:', 0);
      }

      for(var index in ips) {
        var proxy = 'http:' + ips[index];
        (function(proxy) {
          // If proxy are not in bad proxy list
          // Add that proxy to new proxy list
          badProxyLists.exists(proxy, function(result) {
            if(result == false) {
              notCheckedLists.push(proxy);
              get_more_domains();
              /*
              var res = settings.domainInProgress.pop();
              if(typeof res !== 'undefined') {
                (function(res) {
                  callback(res, proxy, -1);
                })(res);
              } 
              */
            } else {
            }
          })
        })(proxy);
      }
    }
  });
}

exports.goodProxyLists = goodProxyLists
exports.notCheckedLists = notCheckedLists
exports.badProxyLists = badProxyLists
exports.secondaryProxyLists = secondaryProxyLists
exports.redis_command = redis_command
exports.parseProxySite = parseProxySite
exports.parseProxyUrlPage = parseProxyUrlPage
exports.getAvailableProxy = getAvailableProxy
exports.debug = debug

exports.set_main_database = function(mdb) {
  db = mdb;
}
