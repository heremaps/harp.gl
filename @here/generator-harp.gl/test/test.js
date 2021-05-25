const fs = require("fs");
const fsExtra = require("fs.extra");
const path = require("path");
const yeomanTestHelpers = require("yeoman-test");
const { assert } = require("chai");
const { spawnSync } = require("child_process");

/*

    Note, in certain environments, custom .npmrc may be needed to run these tests, use like this:

    USE_NPMRC=~/.npmrc npx mocha

*/
describe("harp.gl:app", function () {
    this.timeout(300000);

    let runContext;

    before(async function () {
        runContext = await yeomanTestHelpers
            .run(path.join(__dirname, "../generators/app"))
            .inTmpDir(function (dir) {
                if (process.env.USE_NPMRC) {
                    const targetPath = path.join(dir, ".npmrc");
                    fs.copyFileSync(process.env.USE_NPMRC, targetPath);
                }
            })
            .withPrompts({
                language: "typescript",
                apikey: "test_token"
            });

        assert.isNotNull(runContext);
    });

    it("webpack", async function () {
        const installStatus = spawnSync("npm", ["install"], {
            cwd: runContext.cwd
        });
        assert.strictEqual(installStatus.status, 0, installStatus.output);

        const buildStatus = spawnSync("npm", ["run", "build"], {
            cwd: runContext.cwd
        });
        assert.strictEqual(buildStatus.status, 0, buildStatus.output);
    });

    after(function () {
        if (process.env.KEEP_TEMP_DIR) {
            console.log("Keeping", runContext.cwd);
        } else {
            fsExtra.rmrfSync(runContext.cwd);
        }
    });
});
