var domainInProgress = [];
var domainPerStep = 5000;
var gettingDomains = 0;
var parsingProxySite = 0;
var positiveDomains = 0;
var successRequestCount = 0;

var settings = require('./settings.js');

gets_more_pagerank_domains = function() {

  if(gettingDomains == 0) {
    gettingDomains = 1;
    (function(gettingDomains) {

      //db.collection('domains').find({'page_rank': -1}, {'domain': 1}, {limit: domainPerStep}, function(err, cursor) {
      db.collection('domains').find({}, {'domain': 1}, {limit: domainPerStep}, function(err, cursor) {
        if(err) throw err;
        cursor.each(function(err, el) {
          if(err) throw err;
          if(el) {
            if(false == domainInProgress.filter(function(d, i) { if(d) return d.domain == el.domain})) {
              get_available_proxy(el);
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

get_page_rank_hash = function(domain) {
  var SEED = "Mining PageRank is AGAINST GOOGLE'S TERMS OF SERVICE. Yes, I'm talking to you, scammer."
  var Result = new bignum(0x01020345);
  for(var i = 0; i < domain.length; i++) {
    Result = Result.xor(SEED[i%SEED.length].charCodeAt(0) ^ domain[i].charCodeAt(0));
    Result = Result.shiftRight(23).or(Result.shiftLeft(9));
    Result = Result.and(0xffffffff);
  }
  return '8' + Result.toNumber().toString(16)
}

google_page_rank_search = function(res, proxy, attemps) {

  var proxy_array = proxy.split(':');
  var hash = get_page_rank_hash(res.domain);
  var path='http://toolbarqueries.google.com/tbr?client=navclient-auto&ch=' + hash + '&features=Rank&q=info:' + res.domain;
  //console.log('request', path);

  request.get({
    method: 'GET',
    uri: path,
    gzip: true,
    proxy: {protocol: proxy_array[0] + ':', hostname: proxy_array[1], 'port': proxy_array[2]},
  }, function(error, response, body) {
    successRequestCount ++;
    console.log(successRequestCount);
    if(error) {
      if(attemps > 3 || attemps == -1) { // Give 3 atterms to proxy if that was working before
        redis_client.select(2, function(err, result) {
          redis_client.setex(proxy, 60*60*2, function(err, result) {
            get_available_proxy(res, google_page_rank_search);
          })
        })
      } else {
        ++ attemps;
        setTimeout(1000, function() { google_page_rank_search(res, proxy, attemps) }); 
      }
    }
    else {
      if(body.indexOf('rror') == -1 || body.indexOf('denied') == -1) {
          if(body == '') 
            r = 0
          else {
            if(body.indexOf('Rank_') == -1) { // Google did not return rank for that proxy on 99% that proxy error so we will save it as secondary
              // get_new_proxy and parse domain again
              secondaryProxyLists.push(proxy);
              get_available_proxy(res, google_page_rank_search);
              return 0;
            }
            else {
              r = parseInt(body.split(':')[2])
            } 
          }
          db.collection('domains').update({
            '_id': ObjectId(res._id),
          }, {'$set': {
            'page_rank': r,
          }}, function(err, result) {
            if(err) throw err;
            console.log('works ', res.domain);
            goodProxyLists.push(proxy);
            positiveDomains ++;
            //console.log('working proxy', proxy, 'for domain ', res._id, ' ', res.domain, body.substr(0, 100), r);
            //console.log('domains left', domainInProgress.length, ' proxies left ', goodProxyLists.length, ' domain positive ', positiveDomains);
            if(domainInProgress.length == 0)
              gets_more_pagerank_domains();
            else {
              res = domainInProgress.pop();
              google_page_rank_search(res, proxy, 4);
            }
            // get new domain and use with that proxy
          });
      } else {
        secondaryProxyLists.push(proxy);
        get_available_proxy(res, 'google_page_rank_search');
        return 0;
      }
    }
  })
}


exports.runGooglePageRankSearch = function(mdb) {
  db =  mdb;
  // 1. Get 100 domains
  // 2. Get 100 proxies
  // 3. Check domains
  // 4. Go to 1 till domains are exist
  gets_more_pagerank_domains();
}
