var async = require('async');
var path = require('path');

var http = require('http');
var express = require('express');
var s = require('./support');
var request = s.request;
var expect = s.expect;
var expressx = require('../');

describe('app', function () {

    describe('.middleware(phase, handler)', function () {
        var app;
        var steps;

        beforeEach(function setup() {
            app = expressx();
            steps = [];
        });

        it('runs middleware in phases', function(done) {
            var PHASES = [
                'initial', 'session', 'auth', 'parse',
                'routes', 'files', 'final'
            ];

            PHASES.forEach(function(name) {
                app.middleware(name, namedHandler(name));
            });
            app.use(namedHandler('main'));

            executeMiddlewareHandlers(app, function(err) {
                if (err) return done(err);
                expect(steps).to.eql([
                    'initial', 'session', 'auth', 'parse',
                    'main', 'routes', 'files', 'final'
                ]);
                done();
            });
        });


        it('preserves order of handlers in the same phase', function(done) {
            app.middleware('initial', namedHandler('first'));
            app.middleware('initial', namedHandler('second'));

            executeMiddlewareHandlers(app, function(err) {
                if (err) return done(err);
                expect(steps).to.eql(['first', 'second']);
                done();
            });
        });

        it('supports `before:` and `after:` prefixes', function(done) {
            app.middleware('routes:before', namedHandler('routes:before'));
            app.middleware('routes:after', namedHandler('routes:after'));
            app.use(namedHandler('main'));

            executeMiddlewareHandlers(app, function(err) {
                if (err) return done(err);
                expect(steps).to.eql(['routes:before', 'main', 'routes:after']);
                done();
            });
        });

        it('allows extra handlers on express stack during app.use', function(done) {
            function handlerThatAddsHandler(name) {
                app.use(namedHandler('extra-handler'));
                return namedHandler(name);
            }

            var myHandler;
            app.middleware('routes:before',
                myHandler = handlerThatAddsHandler('my-handler'));
            var found = app._findLayerByHandler(myHandler);
            expect(found).to.be.object;
            expect(myHandler).to.equal(found.handle);
            expect(found).have.property('phase', 'routes:before');
            executeMiddlewareHandlers(app, function(err) {
                if (err) return done(err);
                expect(steps).to.eql(['my-handler', 'extra-handler']);
                done();
            });
        });

        it('allows handlers to be wrapped as __NR_handler on express stack',
            function(done) {
                var myHandler = namedHandler('my-handler');
                var wrappedHandler = function(req, res, next) {
                    myHandler(req, res, next);
                };
                wrappedHandler['__NR_handler'] = myHandler;
                app.middleware('routes:before', wrappedHandler);
                var found = app._findLayerByHandler(myHandler);
                expect(found).to.be.object;
                expect(found).have.property('phase', 'routes:before');
                executeMiddlewareHandlers(app, function(err) {
                    if (err) return done(err);
                    expect(steps).to.eql(['my-handler']);
                    done();
                });
            });

        it('allows handlers to be wrapped as a property on express stack',
            function(done) {
                var myHandler = namedHandler('my-handler');
                var wrappedHandler = function(req, res, next) {
                    myHandler(req, res, next);
                };
                wrappedHandler['__handler'] = myHandler;
                app.middleware('routes:before', wrappedHandler);
                var found = app._findLayerByHandler(myHandler);
                expect(found).to.be.object;
                expect(found).have.property('phase', 'routes:before');
                executeMiddlewareHandlers(app, function(err) {
                    if (err) return done(err);
                    expect(steps).to.eql(['my-handler']);
                    done();
                });
            });

        it('injects error from previous phases into the router', function(done) {
            var expectedError = new Error('expected error');

            app.middleware('initial', function(req, res, next) {
                steps.push('initial');
                next(expectedError);
            });

            // legacy solution for error handling
            app.use(function errorHandler(err, req, res, next) {
                expect(err).to.equal(expectedError);
                steps.push('error');
                next();
            });

            executeMiddlewareHandlers(app, function(err) {
                if (err) return done(err);
                expect(steps).to.eql(['initial', 'error']);
                done();
            });
        });

        it('passes unhandled error to callback', function(done) {
            var expectedError = new Error('expected error');

            app.middleware('initial', function(req, res, next) {
                next(expectedError);
            });

            executeMiddlewareHandlers(app, function(err) {
                expect(err).to.equal(expectedError);
                done();
            });
        });

        it('passes errors to error handlers in the same phase', function(done) {
            var expectedError = new Error('this should be handled by middleware');
            var handledError;

            app.middleware('initial', function(req, res, next) {
                // continue in the next tick, this verifies that the next
                // handler waits until the previous one is done
                process.nextTick(function() {
                    next(expectedError);
                });
            });

            app.middleware('initial', function(err, req, res, next) {
                handledError = err;
                next();
            });

            executeMiddlewareHandlers(app, function(err) {
                if (err) return done(err);
                expect(handledError).to.equal(expectedError);
                done();
            });
        });

        it('scopes middleware to a string path', function(done) {
            app.middleware('initial', '/scope', pathSavingHandler());

            async.eachSeries(
                ['/', '/scope', '/scope/item', '/other'],
                function(url, next) { executeMiddlewareHandlers(app, url, next); },
                function(err) {
                    if (err) return done(err);
                    expect(steps).to.eql(['/scope', '/scope/item']);
                    done();
                });
        });

        it('scopes middleware to a regex path', function(done) {
            app.middleware('initial', /^\/(a|b)/, pathSavingHandler());

            async.eachSeries(
                ['/', '/a', '/b', '/c'],
                function(url, next) { executeMiddlewareHandlers(app, url, next); },
                function(err) {
                    if (err) return done(err);
                    expect(steps).to.eql(['/a', '/b']);
                    done();
                });
        });

        it('scopes middleware to a list of scopes', function(done) {
            app.middleware('initial', ['/scope', /^\/(a|b)/], pathSavingHandler());

            async.eachSeries(
                ['/', '/a', '/b', '/c', '/scope', '/other'],
                function(url, next) { executeMiddlewareHandlers(app, url, next); },
                function(err) {
                    if (err) return done(err);
                    expect(steps).to.eql(['/a', '/b', '/scope']);
                    done();
                });
        });

        it('sets req.url to a sub-path', function(done) {
            app.middleware('initial', ['/scope'], function(req, res, next) {
                steps.push(req.url);
                next();
            });

            executeMiddlewareHandlers(app, '/scope/id', function(err) {
                if (err) return done(err);
                expect(steps).to.eql(['/id']);
                done();
            });
        });

        it('exposes express helpers on req and res objects', function(done) {
            var req;
            var res;

            app.middleware('initial', function(rq, rs, next) {
                req = rq;
                res = rs;
                next();
            });

            executeMiddlewareHandlers(app, function(err) {
                if (err) return done(err);
                expect(getObjectAndPrototypeKeys(req), 'request').to.include.members([
                    'accepts',
                    'get',
                    'param',
                    'params',
                    'query',
                    'res'
                ]);

                expect(getObjectAndPrototypeKeys(res), 'response').to.include.members([
                    'cookie',
                    'download',
                    'json',
                    'jsonp',
                    'redirect',
                    'req',
                    'send',
                    'sendFile',
                    'set'
                ]);

                done();
            });
        });

        it('sets req.baseUrl and req.originalUrl', function(done) {
            var reqProps;
            app.middleware('initial', function(req, res, next) {
                reqProps = { baseUrl: req.baseUrl, originalUrl: req.originalUrl };
                next();
            });

            executeMiddlewareHandlers(app, '/test/url', function(err) {
                if (err) return done(err);
                expect(reqProps).to.eql({ baseUrl: '', originalUrl: '/test/url' });
                done();
            });
        });

        it('preserves correct order of routes vs. middleware', function(done) {
            // This test verifies that `app.route` triggers sort of layers
            app.middleware('files', namedHandler('files'));
            app.get('/test', namedHandler('route'));

            executeMiddlewareHandlers(app, '/test', function(err) {
                if (err) return done(err);
                expect(steps).to.eql(['route', 'files']);
                done();
            });
        });

        it('preserves order of middleware in the same phase', function(done) {
            // while we are discouraging developers from depending on
            // the registration order of middleware in the same phase,
            // we must preserve the order for compatibility with `app.use`
            // and `app.route`.

            // we need at least 9 elements to expose non-stability
            // of the built-in sort function
            var numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9];
            numbers.forEach(function(n) {
                app.middleware('routes', namedHandler(n));
            });

            executeMiddlewareHandlers(app, function(err) {
                if (err) return done;
                expect(steps).to.eql(numbers);
                done();
            });
        });

        it('correctly mounts express apps', function(done) {
            var data;
            var mountWasEmitted;
            var subapp = express();
            subapp.use(function(req, res, next) {
                data = {
                    mountpath: req.app.mountpath,
                    parent: req.app.parent
                };
                next();
            });
            subapp.on('mount', function() { mountWasEmitted = true; });

            app.middleware('routes', '/mountpath', subapp);

            executeMiddlewareHandlers(app, '/mountpath/test', function(err) {
                if (err) return done(err);
                expect(mountWasEmitted, 'mountWasEmitted').to.be.true;
                expect(data).to.eql({
                    mountpath: '/mountpath',
                    parent: app
                });
                done();
            });
        });

        it('restores req & res on return from mounted express app', function(done) {
            // jshint proto:true
            var expected = {};
            var actual = {};

            var subapp = express();
            subapp.use(function verifyTestAssumptions(req, res, next) {
                expect(req.__proto__).to.not.equal(expected.req);
                expect(res.__proto__).to.not.equal(expected.res);
                next();
            });

            app.middleware('initial', function saveOriginalValues(req, res, next) {
                expected.req = req.__proto__;
                expected.res = res.__proto__;
                next();
            });
            app.middleware('routes', subapp);
            app.middleware('final', function saveActualValues(req, res, next) {
                actual.req = req.__proto__;
                actual.res = res.__proto__;
                next();
            });

            executeMiddlewareHandlers(app, function(err) {
                if (err) return done(err);
                expect(actual.req, 'req').to.equal(expected.req);
                expect(actual.res, 'res').to.equal(expected.res);
                done();
            });
        });


        function namedHandler(name) {
            return function(req, res, next) {
                steps.push(name);
                next();
            };
        }

        function pathSavingHandler() {
            return function(req, res, next) {
                steps.push(req.originalUrl);
                next();
            };
        }

        function getObjectAndPrototypeKeys(obj) {
            var result = [];
            for (var k in obj) {
                result.push(k);
            }
            result.sort();
            return result;
        }
    });


    describe('.middlewareFromConfig', function() {
        var app;
        beforeEach(function() {
            app = expressx();
        });
        it('provides API for loading middleware from JSON config', function(done) {
            var steps = [];
            var expectedConfig = { key: 'value' };

            var handlerFactory = function() {
                var args = Array.prototype.slice.apply(arguments);
                return function(req, res, next) {
                    steps.push(args);
                    next();
                };
            };

            // Config as an object (single arg)
            app.middlewareFromConfig(handlerFactory, {
                enabled: true,
                phase: 'session',
                params: expectedConfig
            });

            // Config as a value (single arg)
            app.middlewareFromConfig(handlerFactory, {
                enabled: true,
                phase: 'session:before',
                params: 'before'
            });

            // Config as a list of args
            app.middlewareFromConfig(handlerFactory, {
                enabled: true,
                phase: 'session:after',
                params: ['after', 2]
            });

            // Disabled by configuration
            app.middlewareFromConfig(handlerFactory, {
                enabled: false,
                phase: 'initial',
                params: null
            });

            executeMiddlewareHandlers(app, function(err) {
                if (err) return done(err);
                expect(steps).to.eql([
                    ['before'],
                    [expectedConfig],
                    ['after', 2]
                ]);
                done();
            });
        });

        it('scopes middleware to a list of scopes', function(done) {
            var steps = [];
            app.middlewareFromConfig(
                function factory() {
                    return function(req, res, next) {
                        steps.push(req.originalUrl);
                        next();
                    };
                },
                {
                    phase: 'initial',
                    paths: ['/scope', /^\/(a|b)/]
                });

            async.eachSeries(
                ['/', '/a', '/b', '/c', '/scope', '/other'],
                function(url, next) { executeMiddlewareHandlers(app, url, next); },
                function(err) {
                    if (err) return done(err);
                    expect(steps).to.eql(['/a', '/b', '/scope']);
                    done();
                });
        });
    });

    describe('.defineMiddlewarePhases(nameOrArray)', function() {
        var app;
        beforeEach(function() {
            app = expressx();
        });

        it('adds the phase just before `routes` by default', function(done) {
            app.defineMiddlewarePhases('custom');
            verifyMiddlewarePhases(['custom', 'routes'], done);
        });

        it('merges phases adding to the start of the list', function(done) {
            app.defineMiddlewarePhases(['first', 'routes', 'subapps']);
            verifyMiddlewarePhases([
                'first',
                'initial', // this was the original first phase
                'routes',
                'subapps'
            ], done);
        });

        it('merges phases preserving the order', function(done) {
            app.defineMiddlewarePhases([
                'initial',
                'postinit', 'preauth', // add
                'auth', 'routes',
                'subapps', // add
                'final',
                'last' // add
            ]);
            verifyMiddlewarePhases([
                'initial',
                'postinit', 'preauth', // new
                'auth', 'routes',
                'subapps', // new
                'files', 'final',
                'last' // new
            ], done);
        });

        it('throws helpful error on ordering conflict', function() {
            app.defineMiddlewarePhases(['first', 'second']);
            expect(function() { app.defineMiddlewarePhases(['second', 'first']); })
                .to.throw(/Ordering conflict.*first.*second/);
        });

        function verifyMiddlewarePhases(names, done) {
            var steps = [];
            names.forEach(function(it) {
                app.middleware(it, function(req, res, next) {
                    steps.push(it);
                    next();
                });
            });

            executeMiddlewareHandlers(app, function(err) {
                if (err) return done(err);
                expect(steps).to.eql(names);
                done();
            });
        }
    });
});

function executeMiddlewareHandlers(app, urlPath, callback) {
    var server = http.createServer(function(req, res) {
        app.handle(req, res, callback);
    });

    if (callback === undefined && typeof urlPath === 'function') {
        callback = urlPath;
        urlPath = '/test/url';
    }

    request(server)
        .get(urlPath)
        .end(function(err) {
            if (err) return callback(err);
        });
}
