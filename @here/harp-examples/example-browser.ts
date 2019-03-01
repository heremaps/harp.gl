/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import "style-loader!css-loader!./example-browser.css";

interface ExampleDefinitions {
    [pageUrl: string]: string;
}

/**
 * Example browser HTML / DOM app.
 */
function exampleBrowser(exampleDefinitions: ExampleDefinitions) {
    const navPanel = document.getElementById("navPanel") as HTMLDivElement;
    const titleHeader = document.getElementById("title") as HTMLElement;
    const subtitle = document.getElementById("subtitle") as HTMLElement;
    const exampleFrameElement = document.getElementById("exampleFrame") as HTMLIFrameElement;
    const viewSourceButton = document.getElementById("viewSource") as HTMLButtonElement;

    let currentlySelectedSource: string | undefined;
    const menuElements: HTMLAnchorElement[] = [];

    /**
     * Query params parsed out of hash.
     *
     * Used by xyz example to reload with params while keeping internal state.
     */
    let queryParams = "";

    installHamburgerHandler();
    populateExamplesMenu();

    installFilter(document.getElementById("filterInput") as HTMLInputElement, menuElements);

    function installHamburgerHandler() {
        const expandButton = document.getElementById("hamburgerMenu") as HTMLAnchorElement;

        expandButton.addEventListener("click", event => {
            navPanel.classList.toggle("collapsed");
            event.preventDefault();
        });
    }

    function populateExamplesMenu() {
        const exampleListElement = document.getElementById("exampleList")!;

        Object.keys(exampleDefinitions)
            .sort()
            .forEach(pageUrl => {
                const linkName = getName(pageUrl);
                const linkElement = createDomElement<HTMLAnchorElement>("a", {
                    innerText: linkName,
                    href: "#" + pageUrl,
                    className: "link"
                });
                menuElements.push(linkElement);
                exampleListElement.appendChild(linkElement);
            });
    }

    function installFilter(filterInput: HTMLInputElement, fileteredElements: HTMLElement[]) {
        filterInput.addEventListener("input", e => {
            const filterValue = (filterInput.value || "").trim();

            for (const element of fileteredElements) {
                const text = element.textContent;
                if (text === null) {
                    continue;
                }
                const matches = filterValue === "" || text.includes(filterValue);
                if (matches) {
                    element.classList.remove("filtered");
                } else {
                    element.classList.add("filtered");
                }
            }
        });
    }

    /**
     * Shows an example.
     *
     * @param pageUrl example page url, must exist in `examples` map
     */
    function showExample(pageUrl: string) {
        if (!(pageUrl in exampleDefinitions)) {
            viewSourceButton.style.display = "none";
            exampleFrameElement.contentWindow!.document.body.innerHTML =
                "Invalid example name, please choose one from menu.";

            setupTitle();
            return;
        }

        // update the hash
        window.location.hash = "#" + pageUrl;
        if (queryParams) {
            window.location.search = queryParams;
        }

        // load page in frame
        exampleFrameElement.src = pageUrl + queryParams;

        // highlight selected element in list
        menuElements.forEach(element => {
            const elementTargetPage = element.hash.substr(1);
            if (elementTargetPage === pageUrl) {
                element.classList.add("selected");
                const exampleName = removeNull(element.textContent);
                setupTitle(exampleName);
            } else {
                element.classList.remove("selected");
            }
        });

        // update current source link
        currentlySelectedSource = exampleDefinitions[pageUrl];
        viewSourceButton.style.display = "block";

        // mobile: collapse the navPanel
        navPanel.classList.toggle("collapsed");
    }

    function setupTitle(exampleName?: string) {
        const baseTitle = "<strong>harp.gl</strong> examples";
        document.title = exampleName ? `${exampleName} - harp.gl examples` : `harp.gl examples`;

        titleHeader.innerHTML = exampleName ? `<strong>harp.gl</strong> examples` : `${baseTitle}`;

        subtitle.textContent = exampleName || "";
    }

    /**
     * Install view source button handler
     */
    viewSourceButton!.addEventListener("click", () => {
        if (!currentlySelectedSource) {
            return;
        }

        window.open("codebrowser.html?src=" + encodeURIComponent(currentlySelectedSource));
    });

    /**
     * Show example based on `location.hash` if it's not empty.
     */
    function showExampleFromHash() {
        const hash = window.location.hash;
        if (hash) {
            let pageUrl;

            //check if query parameters are added after the pageUrl in hash
            queryParams = "";
            const match = window.location.hash.match(/([^\?]*)\?(.*)/);
            if (match !== null && match.length > 2) {
                //query parameters found: the file name should not include the query parameters
                pageUrl = match[1].substring(1);
                queryParams = "?" + match[2];
            } else {
                pageUrl = window.location.hash.substring(1);
            }

            // possibly merge current window query string with one parsed-out from hash
            if (window.location.search) {
                queryParams = queryParams
                    ? window.location.search + "&" + queryParams.substr(1)
                    : window.location.search;
            }
            showExample(pageUrl);
        }
    }

    window.addEventListener("hashchange", showExampleFromHash);
    showExampleFromHash();

    interface DomElementProps {
        [property: string]: string;
    }

    function createDomElement<T = HTMLElement>(name: string, options?: DomElementProps): T {
        const element = (document.createElement(name) as any) as T;
        if (options !== undefined) {
            Object.assign(element, options);
        }
        return element;
    }

    /**
     * Convert example link name to readable link title.
     *
     * When converting a path both the all path components extension are removed.
     *
     * Example:
     *
     *     dist/hello.html -> hello
     *     dist/hello_react-native-web.html -> hello / react-native-web
     *
     * @returns human readale example name with components separated with '/'
     */
    function getName(pageUrl: string) {
        const name = basename(pageUrl)
            .replace(/\.[a-z]+$/, "")
            .split("_");
        return name.join(" / ");
    }

    /**
     * Get base name of file, so all parent folders and trailing '/' are removed.
     */
    function basename(path: string) {
        const i = path.lastIndexOf("/");
        if (i === -1) {
            return path;
        } else {
            return path.substr(i + 1);
        }
    }

    function removeNull<T>(v: T | null): T | undefined {
        return v === null ? undefined : v;
    }
}

/**
 * Maps pageUrl to srcUrl.
 *
 * Loaded using <script> tag `example-definitions.js`, which is generated by `webpack.config.js`.
 */
declare const examples: ExampleDefinitions;

exampleBrowser(examples);
