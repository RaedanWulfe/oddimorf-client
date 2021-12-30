const path = require('path');
const fs = require('fs');
const shell = require('shelljs');

const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

shell.rm('-rf', path.resolve(__dirname, "./dist/public*"));

module.exports = {
    target: 'webworker',
    entry: {
        'index': {
            import: "./src/client.js",
        },
        'main': {
            import: "./src/styles/main.scss",
            filename: 'temp/main.js'
        },
        'leaflet': {
            import: "./src/node_modules/leaflet/dist/leaflet.css",
            filename: 'temp/leaflet.js'
        }
    },
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: path.resolve(__dirname, './src/index.html'),
                    to: '',
                },
                {
                    from: path.resolve(__dirname, './src/404.html'),
                    to: '',
                },
                {
                    from: path.resolve(__dirname, './src/images'),
                    to: 'images/',
                },
                {
                    from: path.resolve(__dirname, './src/manifest.webmanifest'),
                    to: '',
                }
            ],
        }),
        new MiniCssExtractPlugin({
            filename: 'styles/[name].css',
            chunkFilename: '[id].css',
        }),
        // new ReplaceInFileWebpackPlugin([
        //     {
        //         dir: 'dist/public/views',
        //         test: /\.svg$/,
        //         rules: [
        //             {
        //                 search: /<link [^>]* href="([^\.]+\.css)"[^>]*>/g,
        //                 replace: match =>
        //                     "<style>\n" +
        //                     fs.readFileSync(path.resolve(__dirname, `./dist/public/${match.substring(
        //                         match.indexOf("href=") + 6,
        //                         match.indexOf(".css") + 4)}`), 'utf8') +
        //                     "\n</style>"
        //             }
        //         ]
        //     }
        // ]),
        {
            apply: (compiler) => {
                compiler.hooks.done.tapAsync(
                    'post-build-clean',
                    (compilation, next) => {
                        shell.rm('-rf', path.resolve(__dirname, "./dist/public/temp"));
                        let dirPath = path.resolve(__dirname, "./dist/public/styles");
                        fs.readdirSync(dirPath).forEach(fileName => {
                            if (new RegExp(/(.*)view-(.*)css$/, 'm').test(fileName))
                                shell.rm('-rf', path.resolve(dirPath, fileName));
                        });
                        next();
                    },
                );
            },
        }
    ],
    resolve: {
        alias: {
            "Modules": path.resolve(__dirname, "./node_modules"),
            "Scripts": path.resolve(__dirname, "./src/scripts"),
            "Styles": path.resolve(__dirname, "./src/styles"),
        }
    },
    module: {
        rules: [
            {
                test: /\.(scss|css)$/,
                use: [
                    { // TODO
                        loader: MiniCssExtractPlugin.loader,
                        options: {
                            publicPath: '/dist/public'
                        }
                    },
                    { // translate CSS into CommonJS
                        loader: 'css-loader',
                        options: {
                            importLoaders: 2,
                            sourceMap: false,
                        }
                    },
                    { // css to generalized css
                        loader: 'postcss-loader',
                    },
                    { // scss to css
                        loader: 'sass-loader',
                    },
                ],
            },
            {
                test: /\.(gif|jpg|png)$/,
                exclude: path.resolve(__dirname, "./node_modules/*"),
                use: [
                    {
                        loader: 'file-loader',
                        options: {
                            name: '[name].[ext]',
                            outputPath: 'images/'
                        }
                    }
                ]
            },
            {
                test: /\.(woff(2)?|eot|ttf|otf|svg|)$/,
                exclude: [/views/],
                use: [
                    {
                        loader: 'url-loader',
                        options: {
                            name: '[name].[ext]',
                            outputPath: 'fonts/'
                        }
                    }
                ]
            },
        ],
    },
};