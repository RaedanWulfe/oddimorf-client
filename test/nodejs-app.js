// https://nodejs.dev/
// https://stackabuse.com/how-to-start-a-node-server-examples-with-the-most-popular-frameworks/

import * as http from 'http';

const HOSTNAME = '127.0.0.1';
const PORT = 8080; //process.env.PORT

// Create an instance of the http server to handle HTTP requests
const app = http.createServer((_, response) => {
    response.statusCode = 200;
    // Set a response type of plain text for the response
    response.setHeader('Content-Type', 'text/plain');
    // Send back a response and end
    // https://nodejs.dev/
    // https://stackabuse.com/how-to-start-a-node-server-examples-with-the-most-popular-frameworks/

    const hostname = '127.0.0.1';
    const port = 8080; //process.env.PORT

    // Create an instance of the http server to handle HTTP requests
    const app = http.createServer((_, response) => {
        response.statusCode = 200;
        // Set a response type of plain text for the response
        response.setHeader('Content-Type', 'text/plain');
        // Send back a response and end the connection
        response.end('Web server successfully running on vanilla Node.js.\n');
    });

    // Start the server on port 3000
    app.listen(port, hostname, () => {
        console.log(`Server running at http://${hostname}:${port}/`);
    });

    response.end('Web server successfully running on vanilla Node.js.\n');
});

// Start the server on port 3000
app.listen(PORT, HOSTNAME, () => {
    console.log(`Server running at http://${HOSTNAME}:${PORT}/`);
});