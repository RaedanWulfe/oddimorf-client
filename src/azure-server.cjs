const path = require('path');
const express = require('express');

/** Default port for webserver to publicize the website resources */
const DEFAULT_SERVER_PORT = 8080;

/** Instantiate the web framework */
var app = express();

/** Set a cookie to indicate environment */
app.use((request, response, next) => {
    response.cookie('isAzure', true, {
        maxAge: 10 * 365 * 24 * 60 * 60 * 1000,
        secure: false,
        httpOnly: false,
        expire: 10 * 365 * 24 * 60 * 60 * 1000
    });
    next();
});

/** Reverse proxy support. */
app.enable('trust proxy');

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

/** Initialize connections */
app.listen(process.env.PORT || DEFAULT_SERVER_PORT);