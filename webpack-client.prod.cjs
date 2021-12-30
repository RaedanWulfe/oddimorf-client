const path = require('path');
const { merge } = require('webpack-merge');
const common = require('./webpack-client.config.cjs');

const WorkboxWebpackPlugin = require('workbox-webpack-plugin');

module.exports = merge(common, {
    mode: 'production',
    devtool: false,
    output: {
        path: path.resolve(__dirname, 'dist/public'),
        publicPath: process.env.ASSET_PATH || '/',
        filename: '[name].bundle.js',
        assetModuleFilename: 'assets/[hash][ext]'
    },
    plugins: [
        new WorkboxWebpackPlugin.GenerateSW({
            clientsClaim: true,
            skipWaiting: true,
            swDest: path.resolve(__dirname, './dist/public/service-worker.js'),
            maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
            cacheId: "oddimorf_hmi",
            mode: 'development',
            exclude: [
                /^.*temp(\\|\/).*$/,
                /^.*styles(\\|\/)view-.*$/,
            ],
            runtimeCaching: [
                {
                    urlPattern: /\.(html|htm|xml|js|png|jpg|jpeg|svg)$/,
                    handler: "StaleWhileRevalidate",
                    options: {
                        cacheName: "general-cache",
                        expiration: {
                            maxEntries: 10,
                            maxAgeSeconds: 5 * 60 * 60
                        },
                        cacheableResponse: {
                            statuses: [0, 200, 404],
                            headers: { 'X-Is-Cacheable': 'true' }
                        },
                    },
                },
            ],
        }),
    ]
});