
var Layer = {}
  , Validator = require('schema-validator')
  , Inflection = require('inflection');

// Logging Layer
Layer.log = {
  ext: require('extlog'),
  level: 'info'
};

// Setup Logging
Layer.log.core = new Layer.log.ext('Layer', "green");
Layer.log.database = new Layer.log.ext('Database', "blue");
Layer.log.model = new Layer.log.ext('Model', "cyan");
Layer.log.routing = new Layer.log.ext('Routing', "magenta");

Layer.start = function (server, database) {
  Layer.log.ext.setMinLevel(Layer.log.level);

  if (!server) Layer.log.core.fatal("Server parameter is empty... we suggest using express.");
  if (!database || database && !database.name || database && typeof database !== 'object')
    Layer.log.core.fatal("Database argument is invalid, must be an object and have a name property.");

  Layer.log.core.info('Flattening Time & Space');
  Layer.log.core.info('Loading Database Adapter: layer-' + database.name);

  var Database = require('layer-' + database.name);
  if (!Database || typeof Database !== 'function')
    Layer.log.core.fatal("Invalid database adapter name", database.name);

  var library = {
    application: server,
    store: {},
    database: new Database(database, library, Layer),
    define: function (name, object) {
      Layer.log.core.info('Defining Model: ' + name);
      library.store[name] = Layer.model(library, name, object);

      if (object.collection) {
        var collection;

        // Check Collection Name
        if (typeof object.collection === 'string') collection = object.collection
        else collection = name;

        // Remove Collection
        delete object.collection;

        // Define Database Collection / Model
        library.database.define(name, library.store[name].build());
      }

      // Return built model
      return library.store[name];
    },

    listen: function (port) {
      Layer.log.core.info('Server started at:', 'http://localhost:' + port + '/');
      library.application.listen(port);
    }
  };

  return library;
};

Layer.model = function (parent, name, object) {
  var route = name.toLowerCase();
  var routing = {
    handle: function (route) {
      if (typeof route === 'undefined' || (typeof route === 'boolean' && route)) route = {
        fetchAll: { remove: [ 'password' ] },
        fetch: { by: 'id', searchable: true },
        create: true,
        count: false,
        empty: false,
        upsert: { by: 'id' },
        update: { by: 'id' }, 
        remove: { by: 'id' }
      };

      Layer.log.routing.info('Creating routes...');

      for (var key in route)
        if (!route.hasOwnProperty(key)) continue;
        else if (routing[key]) routing[key](typeof route[key] === 'object' ? route[key] : {});
    },

    all: function (remove, middleware) {
      Layer.log.routing.debug('Creating fetch-all route', 'GET /' + inflection.pluralize(route));

      parent.application.get('/' + inflection.pluralize(route), (middleware || []), function (request, result) {
        var filter = {}; 

        filter.offset = request.query['offset'] || undefined;
        
        parent.database.all(name, filter, function (error, data) {
          if (error) result.json(404, { error: { message: 'No data found.' }});
          else result.json(200, data);
        })
      });
    },

    fetch: function (options) {
      Layer.log.routing.debug('Creating fetch route', '   GET /' + route + ('/:' + options.by));

      parent.application.get('/' + route + ('/:' + options.by), (options.middleware || []), function (request, result) {
        var query = { };

        query[options.by] = request.params[options.by];

        parent.database.find(name, query, function (error, data) {
          if (error) result.json(404, { error: { message: 'No data found.' }});
          else result.json(200, data);
        });
      });
    },

    create: function (options) {
      Layer.log.routing.debug('Creating create route', '  POST /' + route);

      parent.application.post('/' + route, (options.middleware || []), function (request, result) {
        var data = request.body;
        var validation = new Validator(definition.build());
        var check = validation.check(data);

        if (check._error) {
          result.json(404, { error: { fields: check }});
        } else {
          parent.database.create(name, data, function (error, data) {
            if (error) result.json(404, { error: { message: 'Could not create entry.', details: error }});
            else result.json(200, data);
          });
        }
      });
    },

    upsert: function (options) {
      Layer.log.routing.debug('Creating update/insert (upsert) route', '   PUT /' + route + ('/:' + options.by));

      parent.application.put('/' + route + ('/:' + options.by), (options.middleware || []), function (request, result) {
        var data = request.body;
        var validation = new Validator(definition.build());
        var check = validation.check(data);

        if (check._error) {
          result.json(404, { error: { fields: check }});
        } else {
          data.where = {};
          data.where[options.by] = request.params[options.by];
          parent.database.upsert(name, data, function (error, data) {
            if (error) result.json(500, { error: { message: 'Could not upsert entry with ' + options.by + ' of ' + data.where[options.by], details: error }});
            else result.json(200, data);
          });
        }
      });
    },

    update: function (options) {
      Layer.log.routing.debug('Creating update route', ' PATCH /' + route + ('/:' + options.by));

      parent.application.patch('/' + route + ('/:' + options.by), (options.middleware || []), function (request, result) {
        var data = request.body;
        var validation = new Validator(definition.build());
        var check = validation.check(data);

        if (check._error) {
          result.json(404, { error: { fields: check }});
        } else {
          data.where = {};
          data.where[options.by] = request.params[options.by];
          parent.database.update(name, data, function (error, data) {
            if (error) result.json(500, { error: { message: 'Could not update entry with ' + options.by + ' of ' + data.where[options.by] }});
            else result.json(200, data);
          });
        }
      });
    },

    remove: function (options) {
      Layer.log.routing.debug('Creating remove route', 'DELETE /' + route + ('/:' + options.by));

      parent.application.delete('/' + route + ('/:' + options.by), (options.middleware || []), function (request, result) {
        var query = { where: {} };

        query.where[options.by] = request.params[options.by];

        parent.database.update(name, query, function (error, data) {
          if (error) result.json(500, { error: { message: 'Could not delete entry with ' + options.by + ' of ' + data.where[options.by] }});
          else result.json(200, data);
        });
      });
    },

    count: function (options) {
      Layer.log.routing.debug('Creating count route', '   GET /' + route);

      parent.application.get('/' + route + '/count', (options.middleware || []), function (request, result) {
        var filter = {};
        parent.database.count(name, filter, function (error, data) {
          if (error) result.json(500, { error: { message: 'No data found.' }});
          else result.json(200, data);
        });
      });
    },

    empty: function (options) {
      Layer.log.routing.debug('Creating empty route', '   GET /' + route);

      parent.application.get('/' + route + '/empty', (options.middleware || []), function (request, result) {
        parent.database.empty(name, function (error, data) {
          if (error) result.json(404, { error: { message: 'No data found.' }});
          else result.send(200);
        });
      });
    }
  };

  var definition = {
    name: name,
    store: {},

    property: function (key, object) {
      if (!key) Layer.log.model.fatal("Missing property key for object", object);
      if (key && !object) return definition.store[key];
      if (key && typeof object === 'string') {
        definition.store[key] = Layer.store[type];
      } else definition.store[key] = object;
      return definition;
    },

    build: function () {
      var output = {};

      for (var key in definition.store)
        if (definition.store.hasOwnProperty(key))
          if (Object.prototype.toString.call(definition.store[key]) === '[object Object]')
            if (definition.store[key].store) output[key] = definition.store[key].build();
            else output[key] = definition.store[key];
          else
            output[key] = definition.store[key];

      return output;
    }
  };

  // Routing
  routing.handle(object ? object.routing : undefined);

  // Properties
  if (object) {
    if (object.routing)
      delete object.routing;

    for (var key in object) {
      if (object[key].parent) definition.property(key, object[key].parent);
      else if (object[key].type) definition.property(key, object[key]);
    }
  }

  // Definition
  return definition;
};

module.exports = Layer;