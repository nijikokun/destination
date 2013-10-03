var Layer = require('../layer');
Layer.log.level = 'debug';

// application
var express = require('express');
var app = express();
app.use(express.bodyParser());

var layer = Layer.start(app, {
  name: 'mongodb',
  host: '127.0.0.1'
});

// Another Way
var User = layer.define('User', {
  collection: true,

  routing: {
    fetch: { by: 'name', searchable: false },
    create: true
  },

  name: {
    type: String,
    length: {
      min: 3,
      max: 24
    }
  },

  password: {
    type: String,
    length: {
      min: 3,
      max: 36
    }
  }
});

layer.listen(1337);