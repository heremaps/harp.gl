#!/usr/bin/env ts-node
/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

declare const require: any;

// tslint:disable:no-console

import * as child_process from "child_process";
import * as commander from "commander";
import * as express from "express";
import * as http from "http";
import * as path from "path";

const modulesToLoad: string[] = [];
function addLoadedModule(val: string) {
    modulesToLoad.push(val);
}
commander
    .usage("[options] COMMAND")
    .option("-p, --port <PORT>", "change port number", 8000)
    .option("-r, --require <MODULE>", "load module as middleware", addLoadedModule)
    .option("-C, --dir <DIR>", "serve files from DIR", process.cwd());

commander.parse(process.argv);
const command = commander.args;
if (command.length < 1) {
    commander.outputHelp();
    throw new Error("with-http-server: COMMAND needed");
}

const dir = path.resolve(process.cwd(), commander.opts().dir);

const app = express();
for (const modulePath of modulesToLoad) {
    try {
        // tslint:disable-next-line:no-var-requires
        const module = require(modulePath);
        const middleware =
            typeof module === "function"
                ? module
                : typeof module.default === "function"
                ? module.default
                : undefined;
        if (!middleware) {
            throw new Error("module is not express middleware");
        }
        app.use(middleware);
    } catch (error) {
        console.error(`with-http-server: failed to load module '${modulePath}': ${error}`, error);
        process.exit(2);
    }
}
app.use(express.static(dir));
const server = http.createServer(app);

const port: number = commander.opts().port || 8000;

server.listen(port, () => {
    console.error(`with-http-server: Serving ${dir} at http://localhost:${port}`);
    const cmdFile = command.shift();
    const cmdArgs = command;
    console.error(`with-http-server: Running ${cmdFile} ${cmdArgs.join(" ")}`);
    const child = child_process.spawn(cmdFile!, cmdArgs, {
        shell: true,
        stdio: "inherit"
    });

    child.on("close", code => {
        console.log(`with-http-server: child process exited with code ${code}`);
        process.exit(code);
    });
});
