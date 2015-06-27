var merge = require('utils-merge');
var express = require('express');
var middlewarify = require('./middlewarify');
var mw = require('./express-middleware');

function expressx(app) {
    if (!app) app = express();
    if (!app.expressx) {
        app.expressx = expressx;
        middlewarify(app);
    }
    return app;
}

merge(expressx, express);
merge(expressx, mw);

module.exports = exports = expressx;
