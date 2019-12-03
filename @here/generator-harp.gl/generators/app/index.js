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
                type: "list",
                name: "language",
                message: "language",
                choices: ["typescript", "javascript"]
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
        this.fs.copyTpl([this.templatePath("*.*")], this.destinationPath(), {
            packagename: this.answers.packagename,
            generator_version: version
        });
        this.fs.copyTpl([this.templatePath(this.answers.language)], this.destinationPath(), {
            access_token: this.answers.access_token
        });
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
            "copy-webpack-plugin",
            "html-webpack-plugin",
            "webpack",
            "webpack-cli",
            "webpack-dev-server"
        ]);
        if (this.answers.language === "typescript") {
            this.spawnCommandSync("npm", [
                "install",
                "--save-dev",
                "@types/node",
                "ts-loader",
                "typescript"
            ]);
        }
    }
};
