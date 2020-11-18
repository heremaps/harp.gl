/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @param {import("karma").Config} config
 */
module.exports = function(config) {
    config.set({
        frameworks: ["mocha"],

        // list of files / patterns to load in the browser
        files: [
            "dist/test/three.min.js",
            "test/browser-resources.js",
            "dist/test/test.bundle.js",
            {
                pattern: "@here/**/*.*",
                watched: false,
                included: false
            },
            {
                pattern: "**/harp-fontcatalog/resources/**/*.json",
                watched: false,
                included: false
            }
        ],

        // list of files / patterns to exclude
        exclude: [],

        // preprocess matching files before serving them to the browser
        // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
        // preprocessors: {},

        // test results reporter to use
        // possible values: 'dots', 'progress'
        // available reporters: https://npmjs.org/browse/keyword/karma-reporter
        reporters: ["progress"],

        // web server port
        port: 9876,

        // enable / disable colors in the output (reporters and logs)
        colors: true,

        // level of logging
        // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
        logLevel: config.LOG_INFO,

        // enable / disable watching file and executing tests whenever any file changes
        autoWatch: false,

        // Continuous Integration mode
        // if true, Karma captures browsers, runs the tests and exits
        singleRun: true,

        urlRoot: "/",
        proxies: {
            "/browser/@here": "/base/@here",
            "/browser/@here/harp-fontcatalog/": "/base/node_modules/@here/harp-fontcatalog/"
        },

        // Concurrency level
        // how many browser should be started simultaneous
        concurrency: Infinity
    });
};
