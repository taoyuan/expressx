expressx
====
> An extension for express application to provide extended middleware support.

## Overview
Middleware refers to functions executed when HTTP requests are made to REST endpoints. `Expressx` adds the concept of middleware phases, to clearly define the order in which middleware is called.  Using phases helps to avoid ordering issues that can occur with standard [Express middleware][1].

`Expressx` supports the following types of middleware:
* Pre-processing middleware for custom application logic.  See __example of static middleware__. 
* Dynamic request handling middleware to serve dynamically-generated responses, for example HTML pages rendered from templates and JSON responses to REST API requests. See __example of pre-processing middleware__.
* Static middleware to serve static client-side assets.  See __example of static middleware__.
* Error-handling middleware to deal with request errors. See __example of error-handling middleware__.

### How to add middleware
To add middleware to your application:
1. Specify the middleware function:
	a. If using an existing function or package, add the code to your application or install the package. 
	b. If you are creating a new middleware function, write it.  See [Defining a new middleware handler function](#defining-a-new-middleware-handler-function).
2. Register the middleware. See [Registering middleware in Expressx API](#registering-middleware-in-expressx-api).

### Middleware phases
`Expressx` defines a number of phases, corresponding to different aspects of application execution.  When you register middleware, you can specify the phase in which the application will call it. See [Registering middleware in Expressx API](#registering-middleware-in-expressx-api).  If you register middleware (or routes) with the Express API, then it is executed at the beginning of the routes phase.

The predefined phases are:

1. initial - The first point at which middleware can run.
2. session - Prepare the session object.
3. auth - Handle authentication and authorization.
4. parse - Parse the request body.
5. routes - HTTP routes implementing your application logic. Middleware registered via the Express API app.use, app.route, app.get (and other HTTP verbs) runs at the beginning of this phase.  Use this phase also for sub-apps.
6. files - Serve static assets (requests are hitting the file system here).
7. final - Deal with errors and requests for unknown URLs.

Each phase has "before" and "after" subphases in addition to the main phase, encoded following the phase name, separated by a colon. For example, for the "initial" phase, middleware executes in this order:

1. initial:before 
2. initial
3. initial:after

Middleware within a single subphase executes in the order in which it is registered. However, you should not rely on such order. Always explicitly order the middleware using appropriate phases when order matters.

## Specifying a middleware function
### Using built-in middleware
Expressx provides convenience middleware for commonly-used Express/Connect middleware, as described in the following table.  
When you use this middleware, you don't have to write any code or install any packages; you just specify in which phase you want it to be called; see [Registering middleware in Expressx API](#registering-middleware-in-expressx-api).

To simplify migration from Express 3.x, Expressx provides middleware that was built-in to in Express 3.x, as shown in the following table.  Best practice is to load this middleware directly via require() and not rely on Express's compatibility layer.

Middleware ID           | Code accessor     | External package
------------------------|-------------------|-----------------
expressx#favicon        | expressx.favicon()| serve-favicon
expressx#static         | expressx.static() | serve-static


You can use any middleware compatible with Express; see [Express documentation][2] for a partial list.  Simply install it:

```js
$ npm install --save <module-name>
```

Then simply register it so that it is called as needed; see [Registering middleware in Expressx API](#registering-middleware-in-expressx-api)

### Defining a new middleware handler function
If no existing middleware does what you need, you can easily write your own middleware handler function.
A middleware handler function accepts three arguments, or four arguments if it is error-handling middleware.  The general form is:

```js
function myMiddlewareFunc([err,] req, res, next) { ... };
```

Name 		|Type 		|Optional?									|Description
------------|-----------|-------------------------------------------|-----------
err			|Object		|Required for error-handling middleware.	|Use only for error-handling middleware. Error object, usually an instance or Error; for more information, see Error object.
res			|Object		|No											|The Express response object.
req			|Object		|No											|The Express request object.
next		|Function	|No											|Call next() after your application logic runs to pass control to the next middleware handler.

An example of a middleware function with three arguments, called to process the request when previous handlers did not report an error:

__Regular middleware__

```js
return function myMiddleware(req, res, next) {
    // ...
}
```

Here is a constructor (factory) for this function;

__Regular middleware__

```js
module.exports = function() {
  return function myMiddleware(req, res, next) {
    // ...
  }
}
```

An example a middleware function with four arguments, called only when an error was encountered.

__Error handler middleware__

```js
function myErrorHandler(err, req, res, next) {
  // ...
}
```

### Packaging a middleware function
To share middleware across multiple projects, create a package that exports a middleware constructor (factory) function that accepts configuration options and returns a middleware handler function; for example, as shown below.
 
```js
module.exports = function(options) {
  return function customHandler(req, res, next) {
    // use options to control handler's b behavior  }
};
```

## Registering middleware in Expressx API 

You can register middleware in JavaScript code with: 

* Expressx API; you can specify the phase in which you want the middleware to execute.
* Express API; the middleware is executed at the beginning of the routes phase.

### Using the Expressx API
To register middleware with the Expressx phases API, use the following app methods:

* middleware()
* middlewareFromConfig() 
* defineMiddlewarePhases()

For example:

__server.js__

```js
var expressx = require('expressx');
var morgan = require('morgan');
var errorhandler = require('error-handler');
 
var app = expressx();
 
app.middleware('routes:before', morgan('dev'));
app.middleware('final', errorhandler());
app.middleware('routes', sycle.rest());
```

### Using the Express API
> When you register middleware with the Express API, it is always executed at the beginning of the routes phase.

You can define middleware the "regular way" you do with Express in the main application script file, server.js by calling [app.use()][3] to specify middleware for all HTTP requests to the specified route; You can also use [app.get()][5] to specify middleware for only GET requests, [app.post()][6] to specify middleware for only POST requests, and so on.  For more information, see [app.METHOD][4] in Express documentation.

Here is the general signature for [app.use()][3]:

```js
app.use([route], function([err,] req, res, next) {
  ...
  next();
});
```

As usual, `app` is the Express application object created by expressx() or merged by expressx(app): `app = expressx()` or `expressx(app)` . 

The parameters are:

1. route, an optional parameter that specifies the URI route or "mount path" to which the middleware is bound.  When the application receives an HTTP request at this route, it calls (or triggers) the handler function.  See __Specifying routes__.
2. The middleware handler function (or just "middleware function").  See [Defining a new middleware handler function](#defining-a-new-middleware-handler-function).

For Example:

```js
var expressx = require('expressx');
var syclify = require('syclify');
 
var app = module.exports = expressx();
var sapp = syclify(__dirname);
sapp.app = app;
app.sapp = sapp;
 
// Bootstrap the application, configure models, database and middleware.
sapp.boot(function (err) {
	if (err) throw err;

	// this middleware is invoked in the "routes" phase
	app.use('/status', function(req, res, next) {
	  res.json({ running: true });
	});
});

```

#### Specifying routes
The `route` parameter is a string that specifies the REST endpoint that will trigger the middleware.  If you don't provide the parameter, then the middleware will trigger on all routes.  In addition to a literal string, `route` can be a path matching pattern, a regular expression, or an array including all these types.  For more information, see the [Express documentation for app.use()][3].

For example, to register middleware for all endpoints that start with "/greet":

```js
app.use('/greet', function(req, res, next ) { 
  ... 
})
```

> The above middleware is triggered by all routes that begin with "/greet", so "/greet/you", "greet/me/and/you" will all trigger it..

To register middleware for all endpoints:

```js
app.use(function(req, res, next ) {
  ...
})
```

#### Caveats

There are some things to look out for when using middleware, mostly to do with middleware declaration order.  Be aware of the order of your middleware registration when using "catch-all" routes.  For example:

```js
...
app.get('/', function(req, res, next) {
  res.send('hello from `get` route');
});
app.use(function(req, res, next) {
  console.log('hello world from "catch-all" route');
  next();
});
app.post('/', function(req, res, next) {
  res.send('hello from `post` route')
});
...
```

In this case, since the GET / middleware ends the response chain, the "catch-all" middleware is never triggered when a get request is made. However, when you make a POST request to /, the "catch-all" route is triggered because it is declared __before__ the post route. Doing a POST will show the console message from both the "catch-all" route and the POST / route.



[1]:	http://expressjs.com/api.html#middleware
[2]:	http://expressjs.com/resources/middleware.html
[3]:	http://expressjs.com/4x/api.html#app.use
[4]:	http://expressjs.com/4x/api.html#app.METHOD
[5]:	http://expressjs.com/4x/api.html#app.get
[6]:	http://expressjs.com/4x/api.html#app.post