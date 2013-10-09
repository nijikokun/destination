/**
 * Destination Framework - Built with you in mind.
 * 
 * @copyright 2013 Nijiko Yonskai MIT
 */
var Destination = {}
  , Validator = require('schema-validator')
  , Inflection = require('inflection')
  , Keypath = require('nasa-keypath');

// Logging Destination
Destination.log = {
  ext: require('extlog'),
  level: 'info'
};

// Setup Logging
Destination.log.core = new Destination.log.ext('Core', "green");
Destination.log.database = new Destination.log.ext('Database', "blue");
Destination.log.model = new Destination.log.ext('Model', "cyan");
Destination.log.routing = new Destination.log.ext('Routing', "magenta");

Destination.level = function (level) {
  Destination.log.level = level;
  Destination.log.ext.setMinLevel(Destination.log.level);
};

Destination.start = function (server, database) {
  if (!server) Destination.log.core.fatal("Server parameter is empty... we suggest using express.");
  if (!database || database && !database.name || database && typeof database !== 'object')
    Destination.log.core.fatal("Database argument is invalid, must be an object and have a name property.");

  Destination.log.core.info('Flattening Time & Space');
  Destination.log.core.info('Loading Database Adapter: destination-' + database.name);

  var Database = require('destination-' + database.name);
  if (!Database || typeof Database !== 'function')
    Destination.log.core.fatal("Invalid database adapter name", database.name);

  var objective = {
    application: server,
    store: {},
    database: new Database(database, objective, Destination),
    define: function (name, object) {
      Destination.log.core.info('Defining Model: ' + name);
      objective.store[name] = Destination.model(objective, name, object);

      if (object.collection) {
        var collection;

        // Check Collection Name
        if (typeof object.collection === 'string') collection = object.collection
        else collection = name;

        // Remove Collection
        delete object.collection;

        // Define Database Collection / Model
        objective.database.define(name, objective.store[name].build());
      }

      // Return built model
      return objective.store[name];
    },

    listen: function (port) {
      Destination.log.core.info('Server started at:', 'http://localhost:' + port + '/');
      objective.application.listen(port);
    }
  };

  return objective;
};

Destination.model = function (parent, name, object) {
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

      Destination.log.routing.info('Creating routes...');

      for (var key in route)
        if (!route.hasOwnProperty(key)) continue;
        else if (routing[key]) routing[key](typeof route[key] === 'object' ? route[key] : {});
    },

    all: function (remove, middleware) {
      Destination.log.routing.debug('Creating fetch-all route', 'GET /' + inflection.pluralize(route));

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
      Destination.log.routing.debug('Creating fetch route', '   GET /' + route + ('/:' + options.by));

      parent.application.get('/' + route + ('/:' + options.by), (options.middleware || []), function (request, result) {
        var query = { };

        query[options.by] = request.params[options.by];

        parent.database.find(name, query, function (error, data) {
          if (error) return result.json(404, { error: { message: 'No data found.' }});

          var path = Keypath.on(data);
          if (options.remove)
            for (var i = 0; i < options.remove.length; i++) 
              path.remove(options.remove[i]);

          result.json(200, data); path = null;
        });
      });
    },

    create: function (options) {
      Destination.log.routing.debug('Creating create route', '  POST /' + route);

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
      Destination.log.routing.debug('Creating update/insert (upsert) route', '   PUT /' + route + ('/:' + options.by));

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
      Destination.log.routing.debug('Creating update route', ' PATCH /' + route + ('/:' + options.by));

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
      Destination.log.routing.debug('Creating remove route', 'DELETE /' + route + ('/:' + options.by));

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
      Destination.log.routing.debug('Creating count route', '   GET /' + route);

      parent.application.get('/' + route + '/count', (options.middleware || []), function (request, result) {
        var filter = {};
        parent.database.count(name, filter, function (error, data) {
          if (error) result.json(500, { error: { message: 'No data found.' }});
          else result.json(200, data);
        });
      });
    },

    empty: function (options) {
      Destination.log.routing.debug('Creating empty route', '   GET /' + route);

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
      if (!key) Destination.log.model.fatal("Missing property key for object", object);
      if (key && !object) return definition.store[key];
      if (key && typeof object === 'string') {
        definition.store[key] = Destination.store[type];
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

module.exports = Destination;