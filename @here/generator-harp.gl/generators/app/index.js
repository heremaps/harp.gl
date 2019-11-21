const Generator = require("yeoman-generator");
const path = require("path");
const version = require("../../package.json").version;

module.exports = class extends Generator {
    constructor(args, opts) {
        super(args, opts);
    }

    async prompting() {
        const answers = await this.prompt([
            {
                type: "input",
                name: "packagename",
                message: "package name",
                default: path.basename(process.cwd())
            },
            {
                type: "input",
                name: "access_token",
                message: "access token"
            }
        ]);

        this.answers = answers;
    }

    writing() {
        this.fs.copyTpl(
            [this.templatePath("*.*"), this.templatePath("scripts/*.*")],
            this.destinationPath(""),
            {
                packagename: this.answers.packagename,
                access_token: this.answers.access_token,
                generator_version: version
            }
        );
    }

    install() {
        // npmInstall conflicts with running install-peerdeps, use spawnCommandSync instead
        this.spawnCommandSync("npm", ["install", "--no-save", "install-peerdeps"]);
        this.spawnCommandSync("npx", ["install-peerdeps", "@here/harp-mapview"]);
        this.spawnCommandSync("npm", [
            "install",
            "--save",
            "@here/harp-map-controls",
            "@here/harp-map-theme",
            "@here/harp-omv-datasource"
        ]);
        this.spawnCommandSync("npm", [
            "install",
            "--save-dev",
            "@types/node",
            "copy-webpack-plugin",
            "html-webpack-plugin",
            "ts-loader",
            "typescript",
            "webpack",
            "webpack-cli",
            "webpack-dev-server"
        ]);
    }
};
