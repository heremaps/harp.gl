const Generator = require('yeoman-generator');
const path = require('path');
const version = require("../../package.json").version;

module.exports = class extends Generator {
    constructor(args, opts) {
        super(args, opts);
    }

    async prompting() {
        const answers = await this.prompt([
            {
                type: 'input',
                name: 'packagename',
                message: 'package name',
                default: path.basename(process.cwd())
            }
        ]);

        this.answers = answers;
    }

    writing() {
        this.fs.copyTpl(
            [
                this.templatePath('*.*'),
                this.templatePath('scripts/*.*')
            ],
            this.destinationPath(''),
            {
                packagename: this.answers.packagename,
                generator_version: version
            }
        );
    }
};
