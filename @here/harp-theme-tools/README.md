# Package content - the tools

HARP theme tools are build in Node.js environment (see: https://nodejs.org) so you will
need to install some prerequisities to use them:

-   **Node.js**
-   java script package manager, for example **npm** which is distributed with Node.js or **yarn**.
-   **npx**, the npm package runner, that simplifies usage of CLI tools (in the newest versions of npm it is installed automatically).

There is currently one application in the package and it is distributed as a command line tools (CLI), thus after installing:

```
npm install harp-theme-tools
```

in directory of your choice you will have the following application available:

-   harp-theme-optimizer

You may simply launch it from you command line shell, using **npx**, adding **--help** option allows to see their short version of usage manual:

```
npx harp-theme-optimizer --help
```

# **harp-theme-optimizer**

When using a theme file that includes several other files via the extends syntax this will lead to multiple http requests.
To minimize the http requests for a production application the `harp-theme-optimizer` will combine all included files into one.
Additionaly whitespaces can be removed withe the `--minify` option.

```
npx harp-theme-optimizer --in 'my-theme-file.json' --minify
```
