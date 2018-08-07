const exampleConfig = require("./@here/verity-examples/webpack.config");
const path = require("path");
const fs = require("fs");

const outputPath = path.join(__dirname, "dist/verity-examples");

function patchConfig(config) {
    config.resolve.modules = [__dirname, "node_modules"];
    config.output.path = outputPath;

    // make sure all source files are compiled using the same tsconfig.json
    config.module.rules[0].options.configFile = path.join(__dirname, "tsconfig.json");

    return config;
}

module.exports = exampleConfig.map(config => patchConfig(config));
