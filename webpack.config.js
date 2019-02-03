var path = require('path')
var webpack = require('webpack')
var ExtractTextPlugin = require('extract-text-webpack-plugin')
var HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
    devtool: 'source-map', 
    entry: {
        main: './src/index.js'
    },
    output: {
        path: path.join(__dirname, 'dist'),
        filename: '[name].[hash:8].bundle.js'
    },
    resolve: {
        extensions: [' ', '.js', '.jsx', '.json', '.css', '.less']
    },
    module: {
        rules: [
            {
                test: /\.(jpg|png|gif|woff|woff2|eot|ttf|svg|mp3)$/,
                loader: 'url-loader?name=assets/img/[hash:8].[name].[ext]'
            },
            {
                test: /\.css$/,
                loader: 'style-loader!css-loader?modules'
            },
            {
                test: /\.less$/,
                use: ExtractTextPlugin.extract({
                    fallback: "style-loader",
                    use: ['css-loader', 'less-loader']
                })
            },
            {
                test: /\.js?$/,
                exclude: /node_modules/,
                use: 'babel-loader'
            }]
    },
    plugins: [
        new webpack.HotModuleReplacementPlugin(),
        new webpack.NoEmitOnErrorsPlugin(),
        new ExtractTextPlugin('style.css'),
        new HtmlWebpackPlugin({
            title: 'Redux Practive',
            // favicon: './src/assets/img/favicon.ico',
            filename: './index.html',
            template: './src/index.html',
            inject: true,
            minify: {
                removeComments: true, 
                collapseWhitespace: false
            }
        })
    ],
    devServer: {
        disableHostCheck: true,
    }
}
