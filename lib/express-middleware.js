var path = require('path');

var em = module.exports =  exports;

function safeRequire(m) {
    try {
        return require(m);
    } catch (err) {
        return undefined;
    }
}

function createMiddlewareNotInstalled(memberName, moduleName) {
    return function () {
        var msg = 'The middleware expressx.' + memberName + ' is not installed.\n' +
            'Run `npm install ' + moduleName + ' --save` to fix the problem.';
        throw new Error(msg);
    };
}

var middlewareModules = {
    'compress': 'compression',
    'timeout': 'connect-timeout',
    'cookieParser': 'cookie-parser',
    'cookieSession': 'cookie-session',
    'csrf': 'csurf',
    'errorHandler': 'errorhandler',
    'session': 'express-session',
    'methodOverride': 'method-override',
    'logger': 'morgan',
    'responseTime': 'response-time',
    'favicon': 'serve-favicon',
    'directory': 'serve-index',
    // 'static': 'serve-static',
    'vhost': 'vhost'
};

em.bodyParser = safeRequire('body-parser');
em.json = em.bodyParser && em.bodyParser.json;
em.urlencoded = em.bodyParser && em.bodyParser.urlencoded;

for (var m in middlewareModules) {
    var moduleName = middlewareModules[m];
    em[m] = safeRequire(moduleName) || createMiddlewareNotInstalled(m, moduleName);
}

// serve-favicon requires a path
var favicon = em.favicon;
em.favicon = function (icon, options) {
    icon = icon || path.join(__dirname, '../favicon.png');
    return favicon(icon, options);
};

em.urlNotFound = require('./middleware/url-not-found');
em.status = require('./middleware/status');

em.context = require('endomain').context;
