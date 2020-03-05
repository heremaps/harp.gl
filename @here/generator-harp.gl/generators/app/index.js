const Generator = require("yeoman-generator");
const fs = require("fs");
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
                name: "apikey",
                message: "APIKey"
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
            apikey: this.answers.apikey
        });
    }

    install() {
        const harpPackages = [
            "@here/harp-mapview",
            "@here/harp-datasource-protocol",
            "@here/harp-geoutils",
            "@here/harp-map-controls",
            "@here/harp-map-theme",
            "@here/harp-omv-datasource",
            "@here/harp-webpack-utils"
        ];
        // for CI testing support installing from local packages
        const harpDependencies =
            process.env.HARP_PACKAGE_ROOT !== undefined
                ? harpPackages.map(p => {
                      const root = process.env.HARP_PACKAGE_ROOT + p + path.sep;
                      return root + fs.readdirSync(root).find(f => f.endsWith(".tgz"));
                  })
                : harpPackages;
        // npmInstall conflicts with running install-peerdeps, use spawnCommandSync instead
        this.spawnCommandSync("npm", ["install", "--no-save", "install-peerdeps"]);
        this.spawnCommandSync("npx", ["install-peerdeps", "-o", harpDependencies[0]]);
        this.spawnCommandSync("npm", ["install", "--save", ...harpDependencies]);
        this.spawnCommandSync("npm", [
            "install",
            "--save-dev",
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
