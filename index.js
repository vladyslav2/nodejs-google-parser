'use strict'

var url = 'mongodb://localhost:27017/domain';
var MongoClient = require('mongodb').MongoClient;
const googleBrandSearch = require('./googlebrand.js');

MongoClient.connect(url, function(err, db) {
  if(err) throw err;
  let gb = googleBrandSearch.create({
    db: db
  })
  gb.getMoreDomains()
})
