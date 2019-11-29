#!/usr/bin/env node

"use strict";

const bold = require("ansi-bold");
const fs = require("fs");
const globalDirs = require("global-dirs");
const importFrom = require("import-from");
const inquirer = require("inquirer");
const path = require("path");
const symbols = require("log-symbols");

const npx = importFrom(path.join(globalDirs.npm.packages, "npm"), "libnpx");

async function create(
    argv = process.argv.slice(),
    npmPath = path.join(globalDirs.npm.binaries, "npm")
) {
    const response = await inquirer.prompt([
        {
            type: "input",
            name: "exampleDirectory",
            message: "example directory",
            default: "harp.gl-example"
        }
    ]);

    const directory = response["exampleDirectory"];
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory);
    }
    process.chdir(directory);

    await npx(
        npx.parseArgs(
            [
                ...argv,
                "--package",
                "yo",
                "--package",
                "@here/generator-harp.gl",
                "--",
                "yo",
                "@here/harp.gl"
            ],
            npmPath
        )
    );
    return directory;
}

(async function() {
    if (require.main === module) {
        try {
            const directory = await create();
            console.error(`${symbols.success} ${directory} created successfully!`);

            const command = bold(`cd ${directory} && npm start`);
            console.error(
                `${symbols.success} To start run ${command} and connect to http://localhost:8080`
            );
        } catch (err) {
            console.error(`${symbols.error} creation failure:\n\n${err}\n`);
            process.exit(1);
        }
    }
})();

exports.create = create;
