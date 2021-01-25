/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { LoggerManager } from "@here/harp-utils";
import { assert } from "chai";
import * as ts from "typescript";

const logger = LoggerManager.instance.create("ThemeTypingsTest");

const isNode = typeof window === "undefined";
const describeOnlyNode = isNode ? describe : xdescribe;

function tryTranspile(source: string, silent = false): boolean {
    const sourceFileName = __dirname + "/.test.generated.ts";
    const sourceFile = ts.createSourceFile(sourceFileName, source, ts.ScriptTarget.Latest);

    const compilerHost = ts.createCompilerHost({});

    // override getSourceFile in order to "inject" a string as file
    const oldGetSourceFile = compilerHost.getSourceFile;
    const getSourceFile = (
        fileName: string,
        languageVersion: ts.ScriptTarget,
        onError?: (message: string) => void,
        shouldCreateNewSourceFile?: boolean
    ): ts.SourceFile | undefined => {
        if (fileName === sourceFileName) {
            return sourceFile;
        }
        return oldGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
    };
    compilerHost.getSourceFile = getSourceFile;
    compilerHost.writeFile = () => {
        /* do not write output to file */
    };

    const compilerOptions: ts.CompilerOptions = {
        noEmitOnError: true,
        noImplicitAny: true,
        target: ts.ScriptTarget.Latest,
        module: ts.ModuleKind.CommonJS
    };

    const program = ts.createProgram([sourceFileName], compilerOptions, compilerHost);
    const result = program.emit();

    // force transpilation without warnings
    if (result.diagnostics.length !== 0) {
        if (!silent) {
            logger.warn("diagnostig messages:", result.diagnostics);
        }
        return false;
    }

    return !result.emitSkipped;
}

function validate(type: string, response: any, validationExpectedToFail: boolean = false) {
    const source =
        `import { ${type} } from "../lib/Theme";\n` +
        `const reply: ${type} = ${JSON.stringify(response)};`;

    const result = tryTranspile(source, validationExpectedToFail);
    assert.strictEqual(!result, validationExpectedToFail);
}

describeOnlyNode("Theme typings test", function (this: Mocha.Suite) {
    this.timeout(30000);

    it("syntax test for properly defined Theme object", function (this: Mocha.Context) {
        this.timeout(30000);

        const ProperTheme = {
            styles: {
                omv: [
                    {
                        when: "kind_detail == 'pier' || landuse_kind == 'pier'",
                        technique: "solid-line",
                        final: true,
                        attr: {
                            color: "#fafdfe",
                            lineWidth: [
                                { maxLevel: 13, value: 1.5 },
                                { maxLevel: 14, value: 1.2 },
                                { value: 0.9 }
                            ]
                        }
                    }
                ]
            }
        };

        validate("Theme", ProperTheme);
    });

    it("syntax test for improperly defined Theme object (excessive properties)", function (this: Mocha.Context) {
        this.timeout(30000);

        const ImproperTheme = {
            styles: {
                omv: [
                    {
                        NOT_when: "bar",
                        NOT_technique: "foo",
                        attr: {
                            NOT_lineWidth: [{ maxLevel: 9, value: 160 }, { value: 4 }]
                        }
                    }
                ]
            }
        };

        validate("Theme", ImproperTheme, true);
    });
});
