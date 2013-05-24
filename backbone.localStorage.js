/**
 * Backbone localStorage Adapter
 * Version 1.1.4
 *
 * https://github.com/jeromegn/Backbone.localStorage
 */
(function (root, factory) {
    if (typeof exports === 'object') {
        module.exports = factory(require("underscore"), require("backbone"));
    } else if (typeof define === "function" && define.amd) {
        // AMD. Register as an anonymous module.
        define(["underscore","backbone"], function(_, Backbone) {
            // Use global variables if the locals are undefined.
            return factory(_ || root._, Backbone || root.Backbone);
        });
    } else {
        // RequireJS isn't being used. Assume underscore and backbone are loaded in <script> tags
        factory(_, Backbone);
    }
}(this, function(_, Backbone) {
    // A simple module to replace `Backbone.sync` with *localStorage*-based
    // persistence. Models are given GUIDS, and saved into a JSON object. Simple
    // as that.

    // Hold reference to Underscore.js and Backbone.js in the closure in order
    // to make things work even if they are removed from the global namespace

    // Generate four random hex digits.
    function S4() {
        return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };

    // Generate a pseudo-GUID by concatenating random hexadecimal.
    function guid() {
        return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
    };

    // Our Store is represented by a single JS object in *localStorage*. Create it
    // with a meaningful name, like the name you'd give a table. storage is a
    // reference to the actual asynchronous storage object you're using.
    Backbone.AsyncStorage = function(name, storage) {
        this.name = name;
        this.storage = storage;
        this.records = [];

        var self = this;
        this.asyncStorage().getItem(this.name, function(store) {
            console.log("Found records ", store);
            self.records = (store && store.split(",")) || [];
        });
    };

    _.extend(Backbone.AsyncStorage.prototype, {

        // Save the current state of the **Store** to *localStorage*.
        save: function(callback) {
            this.asyncStorage().setItem(this.name, this.records.join(","), callback);
        },

        // Add a model, giving it a (hopefully)-unique GUID, if it doesn't already
        // have an id of it's own.
        create: function(model, callback) {
            if (!model.id) {
                model.id = guid();
                model.set(model.idAttribute, model.id);
            }

            var self = this;
            this.asyncStorage().setItem(this.name+"-"+model.id, JSON.stringify(model), function() {
                self.records.push(model.id.toString());
                self.save(function() {
                    self.find(model, callback);
                });
            });
        },

        // Update a model by replacing its copy in `this.data`.
        update: function(model, callback) {
            var self = this;
            this.asyncStorage().setItem(this.name+"-"+model.id, JSON.stringify(model), function() {
                if (!_.include(self.records, model.id.toString())) {
                    self.records.push(model.id.toString());
                    self.save(function() {
                        self.find(model, callback);
                    });
                } else {
                    self.find(model, callback);
                }
            });

        },

        // Retrieve a model from `this.data` by id.
        find: function(model, callback) {
            var self = this;
            this.asyncStorage().getItem(this.name+"-"+model.id, function(item) {
                callback(self.jsonData(item));
            });
        },

        // Return the array of all models currently in storage.
        findAll: function(callback) {
            var self = this;

            // Lodash removed _#chain in v1.0.0-rc.1
            var ids = _(this.records).map(function(id) {
                return self.name + "-" + id;
            });

            this.asyncStorage().getItems(ids, function(items) {
                var models = [];
                for (var key in items) {
                    if (items.hasOwnProperty(key)) {
                        models.push(self.jsonData(items[key]))
                    }
                }

                callback(_.compact(models));
            });
        },

        // Delete a model from `this.data`, returning it.
        destroy: function(model, callback) {
            if (model.isNew()) {
                callback(false);
                return;
            }

            var self = this;
            this.asyncStorage().removeItem(this.name+"-"+model.id, function() {
                self.records = _.reject(self.records, function(id) {
                    return id === model.id.toString();
                });
                self.save(function() {
                    callback(model);
                });
            });
        },

        asyncStorage: function() {
            return this.storage;
        },

        // fix for "illegal access" error on Android when JSON.parse is passed null
        jsonData: function (data) {
            return data && JSON.parse(data);
        },

        // Clear localStorage for specific collection.
        _clear: function(callback) {
            var name = this.name,
                local = this.asyncStorage();

            // Remove id-tracking item (e.g., "foo").
            local.removeItem(name, function() {
                local.removeItemsWithKeysLike("^" + name + "-", callback);
            });
        },

        // Size of localStorage.
        _storageSize: function(callback) {
            this.asyncStorage().length(callback);
        }

    });

    // localSync delegate to the model or collection's
    // *localStorage* property, which should be an instance of `Store`.
    // window.Store.sync and Backbone.localSync is deprecated, use Backbone.LocalStorage.sync instead
    Backbone.AsyncStorage.sync = function(method, model, options) {
        var store = model.asyncStorage || model.collection.asyncStorage,
            syncDfd = Backbone.$ && Backbone.$.Deferred && Backbone.$.Deferred(); //If $ is having Deferred - use it.

        var onComplete = function(resp) {
            // add compatibility with $.ajax
            // always execute callback for success and error
            if (options && options.complete) options.complete(resp);
        };
        var onResponse = function(resp) {
            if (options && options.success) {
                if (Backbone.VERSION === "0.9.10") {
                    options.success(model, resp, options);
                } else {
                    options.success(resp);
                }
            }
            if (syncDfd) {
                syncDfd.resolve(resp);
            }

            onComplete(resp);
        };
        var onError = function(errorMessage) {
            errorMessage = errorMessage || "Record Not Found";

            if (options && options.error)
                if (Backbone.VERSION === "0.9.10") {
                    options.error(model, errorMessage, options);
                } else {
                    options.error(errorMessage);
                }

            if (syncDfd) {
                syncDfd.reject(errorMessage);
            }

            onComplete(null);
        };

        try {
            switch (method) {
                case "read":
                    if (model.id != undefined) {
                        store.find(model, onResponse);
                    } else {
                        store.findAll(onResponse);
                    }
                    break;
                case "create":
                    store.create(model, onResponse);
                    break;
                case "update":
                    store.update(model, onResponse);
                    break;
                case "delete":
                    store.destroy(model, onResponse);
                    break;
            }
        } catch(error) {
            onError(error.message);
        }

        return syncDfd && syncDfd.promise();
    };

    Backbone.ajaxSync = Backbone.sync;

    Backbone.getSyncMethod = function(model) {
        if (model.asyncStorage || (model.collection && model.collection.asyncStorage)) {
            return Backbone.AsyncStorage.sync;
        } else if (Backbone.LocalStorage && (model.localStorage || (model.collection && model.collection.localStorage))) {
            return Backbone.LocalStorage.sync;
        }

        return Backbone.ajaxSync;
    };

    // Override 'Backbone.sync' to default to localSync,
    // the original 'Backbone.sync' is still available in 'Backbone.ajaxSync'
    Backbone.sync = function(method, model, options) {
        return Backbone.getSyncMethod(model).apply(this, [method, model, options]);
    };

    return Backbone.AsyncStorage;
}));
