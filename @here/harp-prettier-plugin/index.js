/** @type{import("Prettier").Plugin} */
module.exports = {
    languages: [
        {
            name: "jss",
            parsers: ["jss"],
            extensions: [".json"]
        }
    ],
    parsers: {
        jss: {
            astFormat: "jss_print",
            parse: text => {
                const ast = JSON.parse(text);
                return { ast };
            }
        }
    },
    printers: {
        jss_print: { print: jss_print }
    }
};

/**
 *
 * @param {import("prettier").FastPath} path
 */
function jss_print(path) {
    const printer = new Printer();
    const { ast } = path.getValue();
    return printer.format(ast);
}

function isLiteral(json) {
    return json == null || typeof json !== "object";
}

function isSimple(elements) {
    return elements.length <= 2 && elements.every(n => isLiteral(n));
}

function isAlmostSimple(elements) {
    if (elements.length > 4) {
        return false;
    }
    for (const element of elements) {
        if (Array.isArray(element)) {
            if (!isSimple(element)) {
                return false;
            }
        } else if (!isLiteral(element)) {
            return false;
        }
    }
    return true;
}

class Printer {
    constructor() {
        this.depth = 0;
        this.out = "";
    }

    formatJson(text) {
        return this.format(JSON.parse(text));
    }

    format(json) {
        this.depth = 0;
        this.out = "";
        this.accept(json);
        return this.out;
    }

    newline() {
        this.out += "\n";
    }

    newlineAndIndent() {
        this.newline();
        const count = this.depth * 4;
        this.out += " ".repeat(count);
    }

    accept(node) {
        if (Array.isArray(node)) {
            if (node.length === 0) {
                this.out += "[]";
                return;
            }

            switch (node[0]) {
                case "interpolate": {
                    this.out += "[";
                    this.accept(node[0]);
                    ++this.depth;
                    for (let i = 1; i < node.length; ++i) {
                        this.out += ",";
                        if (i > 1 && i % 2) {
                            this.newlineAndIndent();
                        } else {
                            this.out += " ";
                        }
                        this.accept(node[i]);
                    }
                    this.out += "]";
                    --this.depth;
                    return;
                }

                case "step": {
                    if (node.length > 2) {
                        this.out += "[";
                        this.accept(node[0]);
                        this.out += ", ";
                        this.accept(node[1]);
                        this.out += ",";
                        ++this.depth;
                        this.newlineAndIndent();
                        this.accept(node[2]);
                        for (let i = 3; i < node.length; ++i) {
                            this.out += ",";
                            if (i % 2) {
                                this.newlineAndIndent();
                            } else {
                                this.out += " ";
                            }
                            this.accept(node[i]);
                        }
                        this.out += "]";
                        --this.depth;
                        return;
                    }
                    break;
                }

                case "match": {
                    if (node.length > 2) {
                        this.out += "[";
                        this.accept(node[0]);
                        this.out += ", ";
                        this.accept(node[1]);
                        ++this.depth;
                        for (let i = 2; i < node.length; ++i) {
                            this.out += ",";
                            if (!(i % 2)) {
                                this.newlineAndIndent();
                            } else {
                                this.out += " ";
                            }
                            this.accept(node[i]);
                        }
                        this.out += "]";
                        --this.depth;
                        return;
                    }
                    break;
                }

                case "literal": {
                    if (node.length === 2) {
                        this.out += "[";
                        this.accept(node[0]);
                        this.out += ", ";
                        this.accept(node[1]);
                        this.out += "]";
                        return;
                    }
                    break;
                }
                default:
                    break;
            }

            const shouldBeOnOneLine = isAlmostSimple(node) && node[0] !== "case";

            this.out += "[";
            ++this.depth;
            for (let i = 0; i < node.length; ++i) {
                if (!shouldBeOnOneLine) {
                    this.newlineAndIndent();
                }
                this.accept(node[i]);
                if (i + 1 < node.length) {
                    this.out += ",";
                    if (shouldBeOnOneLine) {
                        this.out += " ";
                    }
                }
            }
            --this.depth;
            if (!shouldBeOnOneLine) {
                this.newlineAndIndent();
            }
            this.out += "]";
        } else if (node && typeof node === "object") {
            const members = Object.keys(node);
            this.out += "{";
            ++this.depth;
            for (let i = 0; i < members.length; ++i) {
                const member = members[i];
                this.newlineAndIndent();
                this.out += JSON.stringify(member);
                this.out += ": ";
                this.accept(node[member]);
                if (i + 1 < members.length) {
                    this.out += ",";
                }
            }
            --this.depth;
            this.newlineAndIndent();
            this.out += "}";
        } else {
            this.out += JSON.stringify(node);
        }
    }
}
