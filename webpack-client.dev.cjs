const path = require('path');
const { merge } = require('webpack-merge');
const common = require('./webpack-client.config.cjs');

module.exports = merge(common, {
    mode: 'development',
    devtool: false,
    output: {
        path: path.resolve(__dirname, 'dist/public'),
        publicPath: process.env.ASSET_PATH || '/',
        filename: '[name].bundle.js',
        assetModuleFilename: 'assets/[hash][ext]'
    },
});