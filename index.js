'use strict'

var url = 'mongodb://localhost:27017/domain';
var MongoClient = require('mongodb').MongoClient;

var db = null;
var googlebrand = require('./googlebrand.js');

MongoClient.connect(url, function(err, mdb) {
  if(err) throw err;

  googlebrand.run(mdb);
})
