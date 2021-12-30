import selfsigned from 'selfsigned';
import fs from 'fs';

var pems = selfsigned.generate(null, {
        keySize: 2048, // the size for the private key in bits (default: 1024)
        days: 9999, // how long till expiry of the signed certificate (default: 365)
        algorithm: 'sha256', // sign the certificate with specified algorithm (default: 'sha1')
        extensions: [{ name: 'basicConstraints', cA: true }], // certificate extensions array
        pkcs7: true, // include PKCS#7 as part of the output (default: false)
        clientCertificate: true, // generate client cert signed by the original key (default: false)
        clientCertificateCN: 'oddimorf' // client certificate's common name (default: 'John Doe jdoe123')
    });

fs.mkdir(
    'src/certs',
    x => {
    if (x) throw x;
    console.log(x);
});

fs.writeFile(
    'src/certs/private.pem',
    pems['private'],
    x => {
    if (x) throw x;
    console.log(x);
});

fs.writeFile(
    'src/certs/public.pem',
    pems['public'],
    x => {
    if (x) throw x;
    console.log(x);
});

fs.writeFile(
    'src/certs/cert.pem',
    pems['cert'],
    x => {
    if (x) throw x;
    console.log(x);
});
