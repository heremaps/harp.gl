/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    PoiStackMode,
    PoiTableDef,
    PoiTableEntryDef,
    PoiTableRef,
    Theme
} from "@here/harp-datasource-protocol";
import {
    composeUrlResolvers,
    defaultUrlResolver,
    LoggerManager,
    resolveReferenceUrl
} from "@here/harp-utils";

import { MapView } from "../MapView";

const logger = LoggerManager.instance.create("PoiTable");

/**
 * Class to store and maintain individual POI information for the [[PoiTable]].
 */
class PoiTableEntry implements PoiTableEntryDef {
    /**
     * Verify that the JSON description of the POI table entry is valid.
     *
     * @param jsonEntry JSON description of the POI table entry.
     *
     * @returns `true` if the `jsonEntry` is valid.
     */
    static verifyJSON(jsonEntry: PoiTableEntryDef): boolean {
        let isOK =
            typeof jsonEntry.name === "string" &&
            jsonEntry.name.length > 0 &&
            (jsonEntry.altNames === undefined || Array.isArray(jsonEntry.altNames)) &&
            (jsonEntry.stackMode === undefined ||
                jsonEntry.stackMode === "yes" ||
                jsonEntry.stackMode === "no" ||
                jsonEntry.stackMode === "parent") &&
            (jsonEntry.visible === undefined || typeof jsonEntry.visible === "boolean") &&
            (jsonEntry.priority === undefined || typeof jsonEntry.priority === "number") &&
            (jsonEntry.iconMinLevel === undefined || typeof jsonEntry.iconMinLevel === "number") &&
            (jsonEntry.iconMaxLevel === undefined || typeof jsonEntry.iconMaxLevel === "number") &&
            (jsonEntry.textMinLevel === undefined || typeof jsonEntry.textMinLevel === "number") &&
            (jsonEntry.textMaxLevel === undefined || typeof jsonEntry.textMaxLevel === "number");

        if (isOK && jsonEntry.altNames !== undefined) {
            const altNames = jsonEntry.altNames as string[];
            for (const str in altNames) {
                if (typeof str !== "string") {
                    isOK = false;
                    break;
                }
            }
        }

        return isOK;
    }

    /** Default name of the POI as the key for looking it up. */
    name?: string;
    /** Alternative names of the POI. */
    altNames?: string[];
    /** Visibility of the POI. If `false`, the POI will not be rendered. */
    visible?: boolean;
    /** Name of the icon, defined in the the texture atlases. */
    iconName?: string;
    /** Stacking mode of the POI. For future use. */
    stackMode?: PoiStackMode;
    /**
     * Priority of the POI to select the visible set in case there are more POIs than can be
     * handled.
     */
    priority?: number;
    /** Minimum zoom level to render the icon on. */
    iconMinLevel?: number;
    /** Maximum zoom level to render the icon on. */
    iconMaxLevel?: number;
    /** Minimum zoom level to render the text label on. */
    textMinLevel?: number;
    /** Maximum zoom level to render the text label on. */
    textMaxLevel?: number;

    /**
     * Setup the [[PoiTableEntry]] from the JSON description. It is assumed that the jsonEntry has
     * been verified with [[PoiTableEntry#verifyJSON]].
     *
     * @param jsonEntry JSON description of the POI table entry. Expected to have been verified with
     *          [[PoiTableEntry#verifyJSON]].
     */
    setup(jsonEntry: PoiTableEntryDef) {
        this.name = jsonEntry.name;
        this.altNames = jsonEntry.altNames;
        this.iconName = jsonEntry.iconName !== undefined ? jsonEntry.iconName : "<undefined>";
        this.visible = jsonEntry.visible;
        this.priority = jsonEntry.priority;
        this.iconMinLevel = jsonEntry.iconMinLevel;
        this.iconMaxLevel = jsonEntry.iconMaxLevel;
        this.textMinLevel = jsonEntry.textMinLevel;
        this.textMaxLevel = jsonEntry.textMaxLevel;

        switch (jsonEntry.stackMode) {
            case "yes":
                this.stackMode = PoiStackMode.Show;
                break;
            case "no":
                this.stackMode = PoiStackMode.Hide;
                break;
            case "parent":
                this.stackMode = PoiStackMode.ShowParent;
                break;
            default:
        }
    }
}

/**
 * The `PoiTable` stores individual information for each POI type. If a [[TextElement]] has a
 * reference to a PoiTable (if TextElement.poiInfo.poiTableName is set), information for the
 * TextElement and its icon are read from the PoiTable.
 *
 * The key to look up the POI is taken from the data, in case of OSM data with TileZen data, the
 * "poiNameField" is set to "kind", which makes the content of the field "kind" in the data the key
 * to look up the POIs in the [[PoiTable]].
 *
 * On the side of the [[PoiTable]], the key to look up the PoiTableEntry is either the property
 * "name" of the [[PoiTableEntry]]s (which should be unique), or the alternative list of names
 * "altNames", where each value should also be unique. If the property `useAltNamesForKey` is set to
 * `true`, the "altNames" will be used.
 */
export class PoiTable {
    /**
     * Stores the list of [[PoiTableEntry]]s.
     */
    readonly poiList: PoiTableEntry[] = new Array();
    /**
     * Dictionary to look up a [[PoiTableEntry]] quickly. The dictionary is either created from the
     * property `name` of the [[PoiTableEntry]]s, or all of the names in each property `altNames`.
     */
    readonly poiDict: Map<string, PoiTableEntry> = new Map();
    private m_isLoading = false;
    private m_loadedOk: boolean | undefined = undefined;

    /**
     * Creates an instance of PoiTable.
     *
     * @param {string} name Name of the `PoiTable`. Must be unique.
     * @param {boolean} useAltNamesForKey Pass `true` to use the contents of the property `altNames`
     *          to find a [[PoiTableEntry]] in the table.
     */
    constructor(readonly name: string, readonly useAltNamesForKey: boolean) {}

    /**
     * Returns `true` if the table is currently being loaded, `false` otherwise.
     *
     * @readonly
     */
    get isLoading(): boolean {
        return this.m_isLoading;
    }

    /**
     * Returns `true` if the table has been loaded correctly, `false` otherwise.
     *
     * @readonly
     */
    get loadedOk(): boolean {
        return this.m_loadedOk === true;
    }

    /**
     * Start to load the PoiTable from the specified URL. Can only be called once per table.
     *
     * @param {string} poiTableUrl URL that points to the JSON file.
     *
     * @returns {Promise<boolean>} Promise is being resolved once the JSON file has been fetched and
     *          the `PoiTable` has been set up.
     */
    async load(poiTableUrl: string): Promise<boolean> {
        if (this.m_loadedOk !== undefined) {
            // Only load once.
            return true;
        }

        this.m_loadedOk = false;

        const response = await fetch(poiTableUrl);

        if (!response.ok) {
            throw new Error(
                `load: Cannot load POI table at ${poiTableUrl}:` + ` ${response.statusText}`
            );
        }

        const jsonPoiTable = (await response.json()) as PoiTableDef;
        if (jsonPoiTable === undefined) {
            logger.info(`load: TextureAtlas empty: ${poiTableUrl}`);
            return true;
        }

        this.startLoading();

        try {
            logger.log(`load: Loading POI table '${poiTableUrl}' for table '${this.name}'`);

            if (jsonPoiTable.poiList !== undefined && Array.isArray(jsonPoiTable.poiList)) {
                for (const tableEntry of jsonPoiTable.poiList) {
                    if (PoiTableEntry.verifyJSON(tableEntry)) {
                        const newPoiEntry = new PoiTableEntry();
                        newPoiEntry.setup(tableEntry);
                        this.poiList.push(newPoiEntry);

                        if (!this.useAltNamesForKey) {
                            // Use actual name of entry as the key
                            if (newPoiEntry.name === undefined) {
                                logger.warn(
                                    `load: Invalid entry in POI table '${poiTableUrl}' : ` +
                                        `. No name set in entry: ${tableEntry}.`
                                );
                            } else {
                                this.poiDict.set(newPoiEntry.name, newPoiEntry);
                            }
                        } else {
                            if (
                                newPoiEntry.altNames !== undefined &&
                                newPoiEntry.altNames.length > 0
                            ) {
                                // Use the list of alternative names as keys.
                                for (const altName of newPoiEntry.altNames) {
                                    this.poiDict.set(altName, newPoiEntry);
                                }
                            } else {
                                logger.warn(
                                    `load: Invalid entry in POI table '${poiTableUrl}' : ` +
                                        `No alternative names set in entry: ${tableEntry}.`
                                );
                            }
                        }
                    } else {
                        logger.warn(
                            `load: Invalid entry in POI table '${poiTableUrl}' : ${tableEntry}`
                        );
                    }
                }
            }
            this.m_loadedOk = true;
            this.finishedLoading();
        } catch (ex) {
            logger.error(`load: Failed to load POI table ` + `'${poiTableUrl}' : ${ex}`);
            this.m_loadedOk = false;
            this.finishedLoading();
            return false;
        }
        return true;
    }

    private startLoading() {
        this.m_isLoading = true;
    }

    private finishedLoading() {
        this.m_isLoading = false;
    }
}

/**
 * The `PoiTableManager` manages the list of [[PoiTables]] that can be defined in the [[Theme]]
 * file.
 */
export class PoiTableManager {
    private m_isLoading = false;
    private m_poiTables: Map<string, PoiTable> = new Map();

    /**
     * Creates an instance of PoiTableManager.
     * @param {MapView} mapView Owning [[MapView]].
     */
    constructor(readonly mapView: MapView) {}

    /**
     * Load the [[PoiTable]]s that are stored in the [[MapView]]s [[Theme]]. Note that duplicate
     * names of [[PoiTable]]s in the [[Theme]] will lead to inaccessible [[PoiTable]]s.
     *
     * @param {Theme} theme [[Theme]] containing all [[PoiTable]]s to load.
     *
     * @returns {Promise<void>} Resolved once all the [[PoiTable]]s in the [[Theme]] have been
     *          loaded.
     */
    async loadPoiTables(theme: Theme): Promise<void> {
        const finished = new Promise<void>(resolve => {
            this.clear();

            // Add the POI tables defined in the theme.
            if (theme.poiTables !== undefined) {
                this.startLoading();

                // Gather promises to signal the success of having loaded them all
                const loadPromises: Array<Promise<boolean>> = new Array();

                // Ensure that all resources referenced in theme by relative URLs are in fact
                // relative to theme.
                const themeUrl = theme.url;
                const childUrlResolver =
                    themeUrl === undefined
                        ? undefined
                        : composeUrlResolvers(
                              (childUrl: string) => resolveReferenceUrl(themeUrl, childUrl),
                              defaultUrlResolver
                          );

                theme.poiTables.forEach((poiTableRef: PoiTableRef) => {
                    if (
                        poiTableRef !== undefined &&
                        poiTableRef.name !== undefined &&
                        typeof poiTableRef.name === "string"
                    ) {
                        const poiTable = new PoiTable(
                            poiTableRef.name,
                            poiTableRef.useAltNamesForKey !== false
                        );
                        if (poiTableRef.url !== undefined && typeof poiTableRef.url === "string") {
                            this.addTable(poiTable);
                            const tableUrl =
                                childUrlResolver === undefined
                                    ? poiTableRef.url
                                    : childUrlResolver(poiTableRef.url);
                            loadPromises.push(poiTable.load(tableUrl));
                        } else {
                            logger.error(`POI table definition has no valid url: ${poiTableRef}`);
                        }
                    } else {
                        logger.error(`POI table definition has no valid name: ${poiTableRef}`);
                    }
                });

                if (loadPromises.length > 0) {
                    Promise.all(loadPromises).then(() => {
                        this.finishLoading();
                        resolve();
                    });
                } else {
                    this.finishLoading();
                    resolve();
                }
            } else {
                this.finishLoading();
                resolve();
            }
        });

        return finished;
    }

    /**
     * Clear the list of [[PoiTable]]s.
     */
    clear() {
        this.m_poiTables = new Map();
    }

    /**
     * Return the map of [[PoiTable]]s.
     */
    get poiTables(): Map<string, PoiTable> {
        return this.m_poiTables;
    }

    /**
     * Manually add a [[PoiTable]]. Normally, the [[PoiTables]]s are specified in the [[Theme]].
     * Ensure that the name is unique.
     */
    addTable(poiTable: PoiTable) {
        this.m_poiTables.set(poiTable.name, poiTable);
    }

    /**
     * Retrieve a [[PoiTable]] by name.
     *
     * @param {(string | undefined)} poiTableName Name of the [[PoiTable]].
     *
     * @returns {(PoiTable | undefined)} The found [[poiTable]] if it could be found, `undefined`
     *          otherwise.
     */
    getPoiTable(poiTableName: string | undefined): PoiTable | undefined {
        return poiTableName === undefined ? undefined : this.m_poiTables.get(poiTableName);
    }

    /**
     * Return `true` if the [[PoiTable]]s have finished loading.
     *
     * @readonly
     */
    get finishedLoading(): boolean {
        return this.m_isLoading;
    }

    private startLoading() {
        this.m_isLoading = true;
    }

    private finishLoading() {
        this.m_isLoading = false;
    }
}
