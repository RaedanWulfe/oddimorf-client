const path = require('path');
const shell = require('shelljs');
const CopyWebpackPlugin = require('copy-webpack-plugin');

shell.rm('-rf', path.resolve(__dirname, "./dist/azure-server.cjs"));
shell.rm('-rf', path.resolve(__dirname, "./dist/certs"));
shell.rm('-rf', path.resolve(__dirname, "./dist/node_modules"));
shell.rm('-rf', path.resolve(__dirname, "./dist/server.cjs"));
shell.rm('-rf', path.resolve(__dirname, "./dist/web.config"));

module.exports = {
    // target: 'es6',
    mode: 'development',
    devtool: false,
    entry: {
        // 'server': {
        //     import: "./src/server.js",
        // },
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        publicPath: process.env.ASSET_PATH || '/',
        filename: '[name].js',
        assetModuleFilename: 'assets/[hash][ext]'
    },
    plugins: [
        new CopyWebpackPlugin({
            patterns: [{
                from: path.resolve(__dirname, './src/azure-server.cjs'),
                to: 'azure-server.cjs',
            }, {
                from: path.resolve(__dirname, './src/certs'),
                to: 'certs',
            }, {
                from: path.resolve(__dirname, './src/node_modules'),
                to: 'node_modules',
            }, {
                from: path.resolve(__dirname, './src/server.cjs'),
                to: 'server.cjs',
            }, {
                from: path.resolve(__dirname, './web.config'),
                to: 'web.config',
            }],
        }), 
    ],
    // resolve: {
    //     alias: {
    //         "Modules": path.resolve(__dirname, "../../node_modules"),
    //     }
    // },
};