#!/usr/bin/env ts-node
/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

declare const require: any;

// tslint:disable:no-console

// tslint:disable-next-line:no-var-requires
const handler = require("serve-handler");
import * as child_process from "child_process";
import * as commander from "commander";
import * as http from "http";
import * as path from "path";

// tslint:disable-next-line:no-var-requires

commander
    .usage("[options] COMMAND")
    .option("-p, --port <PORT>", "change port number", 8000)
    .option("-C, --dir <DIR>", "serve files from DIR", process.cwd());

commander.parse(process.argv);
const command = commander.args;
if (command.length < 1) {
    commander.outputHelp();
    throw new Error("with-http-server: COMMAND needed");
}

const dir = path.resolve(process.cwd(), commander.opts().dir);
const server = http.createServer((request, response) => {
    if (request.url === "/") {
        request.url = "/index.html";
    }
    const serveHandlerOptions = {
        cleanUrls: false,
        public: dir
    };
    return handler(request, response, serveHandlerOptions);
});

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
