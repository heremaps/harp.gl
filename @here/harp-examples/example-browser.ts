/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

interface ExampleDefinitions {
    [pageUrl: string]: string;
}

/**
 * Example browser HTML / DOM app.
 */
function exampleBrowser(exampleDefinitions: ExampleDefinitions) {
    const navPanel = document.getElementById("navPanel") as HTMLDivElement;
    const exampleFrameElement = document.getElementById("exampleFrame") as HTMLIFrameElement;
    const viewSourceButton = document.getElementById("viewSource") as HTMLButtonElement;
    const exampleListElement = document.getElementById("exampleList") as HTMLDivElement;

    let currentlySelectedSource: string | undefined;
    const categories: { [key: string]: HTMLAnchorElement[] } = {};
    const orderedCategories: string[] = [
        "Getting started",
        "Datasource",
        "Rendering",
        "Styling",
        "Threejs",
        "Miscellaneous"
    ];
    const elements: HTMLAnchorElement[] = [];
    const titleElements: HTMLElement[] = [];

    /**
     * Query params parsed out of hash.
     *
     * Used by xyz example to reload with params while keeping internal state.
     */
    let queryParams = "";

    installHamburgerHandler();
    populateExamplesMenu();

    installFilter(document.getElementById("filterInput") as HTMLInputElement);

    function installHamburgerHandler() {
        const expandButton = document.getElementById("hamburgerMenu") as HTMLAnchorElement;
        const closeButton = document.getElementById("closeButton") as HTMLButtonElement;

        expandButton.addEventListener("click", event => {
            navPanel.classList.toggle("collapsed");
            event.preventDefault();
        });
        closeButton.addEventListener("click", event => {
            navPanel.classList.toggle("collapsed");
            event.preventDefault();
        });
    }

    function populateExamplesMenu() {
        Object.keys(exampleDefinitions)
            .sort()
            .forEach(pageUrl => {
                const linkName = getName(pageUrl).replace(new RegExp("-", "g"), " ");
                const linkElements = linkName.split(" / ");
                // Create category 'miscellaneous' for examples without category name.
                let linkSubMenu = linkElements.length > 1 ? linkElements[0] : "miscellaneous";

                // Style: uppercase the first letter in case CSS lets lowercase.
                linkSubMenu = linkSubMenu.charAt(0).toUpperCase() + linkSubMenu.slice(1);
                // Create category if needed.
                if (categories[linkSubMenu] === undefined) {
                    categories[linkSubMenu] = [];
                }
                const visibleText =
                    linkElements.length === 1 ? linkName : linkElements.slice(1).join(" / ");
                const linkElement = createDomElement<HTMLAnchorElement>("a", {
                    innerText: visibleText,
                    href: "#" + pageUrl,
                    className: "link"
                });
                (linkElement as any).nameWithCategory = linkName;
                (linkElement as any).nameWithoutCategory = visibleText;
                categories[linkSubMenu].push(linkElement);
                elements.push(linkElement);
            });

        Object.keys(categories)
            .sort()
            .forEach(category => {
                if (!orderedCategories.includes(category)) {
                    orderedCategories.push(category);
                }
            });

        orderedCategories.forEach(menuElement => {
            const menu = document.createElement("div");
            const title = document.createElement("h2");
            title.innerHTML = menuElement;
            titleElements.push(title);
            menu.appendChild(title);
            const category = categories[menuElement];
            if (category === undefined) {
                return;
            }
            category.forEach(anchor => {
                menu.appendChild(anchor);
            });
            exampleListElement.appendChild(menu);
        });
    }

    let isSearching: boolean = false;

    function goInSearchMode() {
        titleElements.forEach(title => {
            title.style.cssText = "display:none;";
        });
        document.getElementById("magnifier-placeholder")!.style.cssText = "display:none;";
        document.getElementById("clearFilterButton")!.style.cssText = "";
        elements.forEach(anchor => {
            anchor.innerText = (anchor as any).nameWithCategory;
        });
        isSearching = true;
    }

    function leaveSearchMode() {
        titleElements.forEach(title => {
            title.style.cssText = "";
        });
        document.getElementById("magnifier-placeholder")!.style.cssText = "";
        document.getElementById("clearFilterButton")!.style.cssText = "display:none;";
        elements.forEach(anchor => {
            anchor.classList.remove("filtered");
            anchor.innerText = (anchor as any).nameWithoutCategory;
        });
        (document.getElementById("filterInput") as HTMLInputElement).value = "";
        isSearching = false;
    }

    function installFilter(filterInput: HTMLInputElement) {
        filterInput.addEventListener("input", e => {
            const filterValue = (filterInput.value || "").trim();

            if (filterValue.length > 0 && !isSearching) {
                goInSearchMode();
            }

            if (filterValue.length === 0 && isSearching) {
                leaveSearchMode();
            }

            for (const element of elements) {
                const text = element.textContent;
                if (text === null) {
                    continue;
                }
                const matches = filterValue === "" || text.includes(filterValue.toLowerCase());
                if (matches) {
                    element.classList.remove("filtered");
                } else {
                    element.classList.add("filtered");
                }
            }
        });
        document.getElementById("clearFilterButton")!.addEventListener("click", leaveSearchMode);
    }

    /**
     * Shows an example.
     *
     * @param pageUrl - example page url, must exist in `examples` map
     */
    function showExample(pageUrl: string) {
        const expandButton = document.getElementById("hamburgerMenu") as HTMLAnchorElement;
        expandButton.classList.toggle("expanded", !navPanel.classList.contains("collapsed"));
        if (!(pageUrl in exampleDefinitions)) {
            viewSourceButton.style.display = "none";
            exampleListElement.style.bottom = "365px";
            exampleFrameElement.contentWindow!.document.body.innerHTML =
                `<p style="color:#888;font-size:20px;font-family:sans-serif;text-align:center;` +
                `top: 50%; margin-top: -100px; position: absolute; width: 100% ">` +
                `<strong style="font-size:80px; ">404</strong><br/>Example not found</p>`;
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
        elements.forEach(element => {
            const elementTargetPage = element.hash.substr(1);
            if (elementTargetPage === pageUrl) {
                element.classList.add("selected");
            } else {
                element.classList.remove("selected");
            }
        });

        // update current source link
        currentlySelectedSource = exampleDefinitions[pageUrl];
        viewSourceButton.style.display = "block";
        exampleListElement.style.bottom = "65px";

        // mobile: collapse the navPanel
        navPanel.classList.toggle("collapsed");
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
}

/**
 * Maps pageUrl to srcUrl.
 *
 * Loaded using <script> tag `example-definitions.js`, which is generated by `webpack.config.js`.
 */
declare const examples: ExampleDefinitions;

exampleBrowser(examples);
