/*
 * Copyright (C) 2017-2020 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as core from "@actions/core";
import * as github from "@actions/github";
import * as Webhooks from "@octokit/webhooks";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import * as gitDiffParser from "gitdiff-parser";
import * as path from "path";

// tslint:disable: no-console

const API_DOC_DIR: string = "input";

const initialConfig = {
    GITHUB_EVENT_NAME: process.env.GITHUB_EVENT_NAME,
    GITHUB_EVENT_PATH: process.env.GITHUB_EVENT_PATH,
    GITHUB_ACTOR: process.env.GITHUB_ACTOR,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN
};

if (initialConfig.GITHUB_TOKEN === undefined) {
    throw new Error("missing GITHUB_TOKEN");
}

if (initialConfig.GITHUB_EVENT_PATH === undefined) {
    throw new Error("missing GITHUB_EVENT_PATH");
}

if (initialConfig.GITHUB_ACTOR === undefined) {
    throw new Error("missing GITHUB_ACTOR");
}

if (initialConfig.GITHUB_EVENT_NAME !== "pull_request") {
    process.exit(0);
}

async function main() {
    const status = execSync("git status --porcelain").toString();
    if (status === "") {
        return;
    }

    const gitDiff = execSync(`git diff`).toString();

    const payload = github.context.payload;
    if (payload.pull_request === undefined) {
        throw new Error("Action not triggered by pull request.");
    }
    const pr = payload.pull_request! as Webhooks.Webhooks.WebhookPayloadPullRequest;

    const octokit = github.getOctokit(initialConfig.GITHUB_TOKEN!);
    const commentResponse = await octokit.issues.createComment({
        owner: initialConfig.GITHUB_ACTOR!,
        repo: "heremaps/harp.gl",
        issue_number: pr.number,
        body: gitDiff
    });

    console.log(commentResponse);

    // octokit.pulls.createComment({
    //     owner: initialConfig.GITHUB_ACTOR!,
    //     repo: "heremaps/harp.gl",
    //     pull_number: pr,
    //     mediaType: {
    //         format: "diff"
    //     },
    //     body: gitDiff
    // });

    const modifiedFiles = (gitDiffParser as any).parse(gitDiff) as gitDiffParser.File[];

    modifiedFiles.forEach((file: gitDiffParser.File) => {
        if (path.extname(file.newPath) !== ".md" || path.dirname(file.newPath) !== API_DOC_DIR) {
            return;
        }

        // file.hunks.forEach(hunk => console.log(hunk.changes));
    });
}

main();
