const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const https = require('https');

/** Standard port where the unsecured HTTP site may be reached (note: this is pretty standard, in modern usage access to this will redirect to the secure port) */
const DEFAULT_SERVER_PORT = 8080;

/** Port where the secured HTTP site may be reached (note: may be assumed as the practical default in the modern usage context) */
const SECURE_SERVER_PORT = 8081;

/** Location of keys and certificates that the server needs as part of its HTTPs aspect. */
const encryption = {
    key: fs.readFileSync(path.join(__dirname, './certs/private.pem')),
    cert: fs.readFileSync(path.join(__dirname, './certs/cert.pem')),
};

/** Instantiate the web framework */
var app = express();

/** Set a cookie to indicate environment */
app.use((request, response, next) => {
    response.cookie('isAzure', false, {
        maxAge: 10 * 365 * 24 * 60 * 60 * 1000,
        secure: false,
        httpOnly: false,
        expire: 10 * 365 * 24 * 60 * 60 * 1000
    });
    next();
});

/** Reverse proxy support. */
app.enable('trust proxy');

/** HTTP -> HTTPS redirect */
app.use((request, response, next) => {
    if (request.secure)
        return next();

    var hostName = request.headers.host.substr(0, request.headers.host.indexOf(':'));
    response.redirect(`https://${hostName}:${SECURE_SERVER_PORT}${request.url}`);
});

/** Setup root path for static resources */
app.use(express.static(path.join(__dirname, 'public')));

/** Serve entry files from relative path, with the specific index file as default */
app.get('/', (request, response, next) => {
    response
        .sendFile('./index.html', { root: __dirname })
});

/** Serve custom 404 page if the url path is not found. */
app.use((request, response, next) => {
    response
        .status(404)
        .sendFile('./public/404.html', { root: __dirname })
});

/** Create the HTTP directory server, then start to listen for requests to the indicated "unsecured" port */
http
    .createServer(app)
    .listen(process.env.PORT || DEFAULT_SERVER_PORT);

/** Create the HTTPS directory server with the configured encryption setup, then start to listen for requests to the indicated "secure" port */
https
    .createServer(encryption, app)
    .listen(process.env.PORT || SECURE_SERVER_PORT);