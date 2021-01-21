/*
 * Copyright (C) 2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from "child_process";
import * as fs from "fs";

/**
 * To determine the first and last commit year of the file and check against the year(s) in the file's copyright:
 * @param sourceFile Path of the source file
 * @param match License match result
 * @param callback Callback to call once check is completed. Error message should be passed back
 */
function checkYear(
    sourceFile: string,
    [start, end]: string[],
    callback: (err?: string) => void
): void {
    const currentYear = String(new Date().getFullYear());
    exec(
        [
            // Added
            `git --no-pager log --follow --diff-filter=A -n 1 --format=%ad --date=format:%Y -- ${sourceFile}`,

            // Last modified
            `git --no-pager log --follow --diff-filter=MRCA -n 1 --format=%ad --date=format:%Y -- ${sourceFile}`
        ].join(" && "),
        (error, stdOut, stdErr) => {
            const copyrightStart = start;
            const hasRange = end !== undefined;
            const copyrightEnd = hasRange ? end : start;
            const found = `${copyrightStart}${hasRange ? "-" + copyrightEnd : ""}`;
            if (error) {
                callback(error.message);
            } else if (stdErr) {
                callback(stdErr.toString());
            } else if (stdOut.toString() === "") {
                // The file is not in Git repository yet, we can't detect the years.
                // Please commit first and re-run.
                callback();
            } else if (!/^\d{4}\n\d{4}\n$/.test(stdOut.toString())) {
                callback(`Can't determine first/last year of Git commit for file ${sourceFile}`);
            } else {
                const [firstCommit, lastCommit] = stdOut.toString().split("\n");
                if (
                    copyrightStart !== firstCommit ||
                    copyrightEnd !== lastCommit ||
                    (hasRange && copyrightStart === copyrightEnd)
                ) {
                    // Since a new commit is needed to fix it, the new commit must contain the current year:
                    const expected = `${firstCommit}${
                        firstCommit !== currentYear ? "-" + currentYear : ""
                    }`;
                    if (found !== expected) {
                        callback(`${sourceFile} expected: ${expected}, found: ${found}`);
                    } else {
                        callback();
                    }
                } else {
                    callback();
                }
            }
        }
    );
}

/**
 * Checks whether specified source files contain license matching the specified RegExp.
 * @param sourceFiles The source files to check
 * @param licenseRegEx RegExp to match the license.
 *                      IMPORTANT, RegExp match should match the whole license and in the match groups returns the
 *                      following:
 *                      - match[1] - copyright start year
 *                      - match[2] - copyright end year (if specified)
 * @param callback The callback function to execute upon completion. Array of errors strings is passed back,
 *                 in case not matching file is found.
 * @param [fix=false] Flag indicating whether correct licenses should be automatically fixed. Default is false.
 */
export function checkLicenses(
    sourceFiles: string[],
    licenseRegEx: RegExp,
    callback: (errors: string[]) => void,
    fix = false
) {
    const total = sourceFiles.length;
    const errors: string[] = [];
    let current = 0;

    function checkIfDone() {
        if (++current >= total) {
            callback(errors);
        }
    }

    sourceFiles.forEach(sourceFile => {
        const content = fs.readFileSync(sourceFile, { encoding: "utf8" });
        const match = licenseRegEx.exec(content);
        if (match === null) {
            errors.push(`${sourceFile} has no valid copyright notice`);
            checkIfDone();
        } else {
            checkYear(sourceFile, [match[1], match[2]], error => {
                if (error) {
                    // Let's fix it in case of wrong year(s) found and AUTO_FIX is activated:
                    const errorMatch = /expected: (.+), found: (.+)/.exec(error);
                    if (fix && errorMatch !== null) {
                        fs.writeFileSync(
                            sourceFile,
                            content.replace(
                                licenseRegEx,
                                match[0].replace(errorMatch[2], errorMatch[1])
                            ),
                            { encoding: "utf8" }
                        );
                    } else {
                        errors.push(error);
                    }
                }
                checkIfDone();
            });
        }
    });
}
