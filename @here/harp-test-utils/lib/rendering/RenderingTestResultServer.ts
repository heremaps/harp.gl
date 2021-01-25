/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// @here:check-imports:environment:node

import { LoggerManager } from "@here/harp-utils";
import * as bodyParser from "body-parser";
import * as express from "express";
import * as fs from "fs";
import * as mkpath from "mkpath";
import * as path from "path";
import * as serveStatic from "serve-static";
import * as util from "util";

import { genHtmlReport } from "./HtmlReport";
import { ImageTestResultLocal, ImageTestResultRequest } from "./Interface";
import { getOutputImagePath, loadSavedResults } from "./RenderingTestResultCommon";

const logger = LoggerManager.instance.create("RenderingTestResultServer");
const writeFile = util.promisify(fs.writeFile);
const promisedMkpath = util.promisify(mkpath) as any;

let outputBasePath = "./rendering-test-results";

/**
 * Parse `base64`-encoded `data-uri` string and present result as tuple of:
 * * `contentType: string`
 * * `buffer: Buffer`.
 */
function parseDataUri(dataUri: string) {
    const split = dataUri.split(",");
    const metaRegex = /^data:(.+\/.+);(.*)$/;
    const matches = split[0].match(metaRegex);
    if (!matches || matches[2] !== "base64") {
        throw new Error("parseDataUri: invalid format of DataUri input");
    }

    return {
        contentType: matches[1],
        buffer: Buffer.from(split[1], "base64")
    };
}

let currentResults: ImageTestResultLocal[] = [];

function updateCurrentResults(newResult: ImageTestResultLocal) {
    const matchingIdx = currentResults.findIndex(baseResult => {
        return newResult.actualImagePath === baseResult.actualImagePath;
    });
    if (matchingIdx !== -1) {
        currentResults[matchingIdx] = newResult;
    } else {
        currentResults.push(newResult);
    }
}

export async function postIbctFeedback(req: express.Request, res: express.Response) {
    try {
        const payload: ImageTestResultRequest = req.body;
        logger.log(`received results for`, JSON.stringify(payload.imageProps));
        const evaluation =
            payload.comparisonResult === undefined
                ? "no reference image"
                : payload.comparisonResult.mismatchedPixels === 0
                ? "ok"
                : `failed: ${payload.comparisonResult.mismatchedPixels} wrong pixels`;

        logger.log(`/ibct-feedback: result: ${evaluation}`);
        const imageProps = payload.imageProps;

        const imageResultPath = getOutputImagePath(
            {
                ...imageProps,
                extra: ".ibct-result",
                extension: ".json"
            },
            outputBasePath
        );
        const imageResult: ImageTestResultLocal = {
            imageProps,
            passed: payload.passed
        };

        if (payload.actualImage) {
            const actualImage = parseDataUri(payload.actualImage);

            const actualImagePath = getOutputImagePath(
                { ...imageProps, extra: ".current" },
                outputBasePath
            );
            logger.log(`writing current image: ${actualImagePath}`);
            await promisedMkpath(path.dirname(actualImagePath));
            await writeFile(actualImagePath, actualImage.buffer);

            imageResult.actualImagePath = actualImagePath;
        }

        if (payload.comparisonResult && payload.comparisonResult.diffImage) {
            const diffImage = parseDataUri(payload.comparisonResult.diffImage);
            const diffImagePath = getOutputImagePath(
                { ...imageProps, extra: ".diff" },
                outputBasePath
            );
            logger.log(`writing diff image: ${diffImagePath}`);
            await promisedMkpath(path.dirname(diffImagePath));
            await writeFile(diffImagePath, diffImage.buffer);

            imageResult.diffImagePath = diffImagePath;
            imageResult.mismatchedPixels = payload.comparisonResult.mismatchedPixels;
        }

        logger.log(`writing report ${imageResultPath}`);
        await promisedMkpath(path.dirname(imageResultPath));
        await writeFile(imageResultPath, JSON.stringify(imageResult, null, 2));

        updateCurrentResults(imageResult);
        res.status(200).send("OK");
    } catch (error) {
        logger.error("error", error);
        res.status(500).send(`error: ${error}`);
    }
}

export async function getIbctReport(req: express.Request, res: express.Response) {
    try {
        const [failed, report] = await genHtmlReport(currentResults, {}, outputBasePath);
        logger.log("Tests failed: ", failed);
        res.status(200).contentType("text/html").send(report);
    } catch (error) {
        logger.error("error", error);
        res.status(500).send(`error: ${error}\n${error.stack}`);
    }
}

export function getReferenceImage(req: express.Request, res: express.Response) {
    const imageProps = req.query;
    const relPath = getOutputImagePath({ ...imageProps, extra: ".reference" }, outputBasePath);

    res.sendFile(path.resolve(process.cwd(), relPath));
}

/**
 * Install RenderingTestResultServer in `express.Router`.
 *
 * Example usage i.e `webpack-dev-server` configuration in `webpack.config.js`:
 *
 *     devServer: {
 *       before: function(app) {
 *         require('ts-node/register'); // so we can load typescript seamlessly
 *         const RenderingTestResultServer = require(
 *          "coresdk/@here/harp-test-utils/lib/rendering/RenderingTestResultServer"
 *         );
 *         RenderingTestResultServer.installMiddleware(app);
 *       }
 *     }
 */
export function installMiddleware(app: express.Router, basePath: string) {
    loadSavedResults().then(results => {
        currentResults = results;
    });

    outputBasePath = basePath;

    // tslint gives a false alert b/c bodyParser is a function(deprecated) and a namespace.
    // We are using the non-deprecated namespace here, so all fine.
    const jsonParser = bodyParser.json({ limit: 1024 * 1024 * 16 });
    app.get("/ibct-report", jsonParser, getIbctReport);
    app.post("/ibct-feedback", jsonParser, postIbctFeedback);
    app.get("/reference-image", getReferenceImage);

    logger.info("serving IBCT report at /ibct-report endpoint");
    logger.info("accepting IBCT results at /ibct-feedback endpoint");
}

function createExpressRouter(): express.Router {
    const router = express.Router();
    installMiddleware(router, outputBasePath);
    return router;
}

let expressRouter: express.Router | undefined;

export function expressMiddleware(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
) {
    if (expressRouter === undefined) {
        expressRouter = createExpressRouter();
    }
    return expressRouter(req, res, next);
}

/**
 * Default export is `express` middleware function.
 *
 * Usage
 * ```
 * import RenderTestResultServer from "..."
 * app.use(RenderTestResultServer);
 * ```
 */
export default expressMiddleware;

/**
 * Start `RenderingTestResultServer` as simple, standalone HTTP server which
 * * supports /ibct-feedback endpoint
 * * servers files from `process.cwd()`
 */
export function startStandaloneServer(host: string, port: number) {
    const app = express();
    logger.log("start standaloneServer: ", outputBasePath);

    installMiddleware(app, outputBasePath);
    app.use(serveStatic(".", { index: ["index.html"] }));
    app.listen(port, host, () => {
        logger.log(`listening on port ${host}:${port}!`);
    });
}

/**
 * When ran as CLI.
 *
 * First argument is specified then use it as output file path where to store
 * files from running tests (actual results)
 * Default outputBasePath is "./ibct-results"
 */

if (require.main === module) {
    const host = process.env.HOST ?? "localhost";
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8081;

    if (process.argv.length > 2) {
        outputBasePath = process.argv[2];
    }
    startStandaloneServer(host, port);
}
