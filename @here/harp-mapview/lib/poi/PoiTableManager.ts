/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    PoiStackMode,
    PoiTableDef,
    PoiTableEntryDef,
    PoiTableRef
} from "@here/harp-datasource-protocol";
import { LoggerManager } from "@here/harp-utils";

import { MapView } from "../MapView";

const logger = LoggerManager.instance.create("PoiTable");

/**
 * Class to store and maintain individual POI information for the {@link PoiTable}.
 */
class PoiTableEntry implements PoiTableEntryDef {
    /**
     * Verify that the JSON description of the POI table entry is valid.
     *
     * @param jsonEntry - JSON description of the POI table entry.
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
            // eslint-disable-next-line @typescript-eslint/no-for-in-array
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
     * @param jsonEntry - JSON description of the POI table entry. Expected to have been verified
     *                    with [[PoiTableEntry#verifyJSON]].
     */
    setup(jsonEntry: PoiTableEntryDef) {
        this.name = jsonEntry.name;
        this.altNames = jsonEntry.altNames;
        this.iconName = jsonEntry.iconName;
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
 * The `PoiTable` stores individual information for each POI type.
 *
 * @remarks
 * If a {@link TextElement} has a
 * reference to a PoiTable (if TextElement.poiInfo.poiTableName is set), information for the
 * TextElement and its icon are read from the PoiTable.
 *
 * The key to look up the POI is taken from the data, in case of OSM data with TileZen data, the
 * `poiNameField` is set to `kind`, which makes the content of the field `kind` in the data the key
 * to look up the POIs in the {@link PoiTable}.
 *
 * On the side of the {@link PoiTable}, the key to look up the PoiTableEntry is either the property
 * "name" of the [[PoiTableEntry]] (which should be unique), or the alternative list of names
 * `altNames`, where each value should also be unique. If the property `useAltNamesForKey` is set to
 * `true`, the `altNames` will be used.
 */
export class PoiTable {
    /**
     * Stores the list of [[PoiTableEntry]]s.
     */
    private readonly poiList: PoiTableEntry[] = new Array();
    /**
     * Dictionary to look up for [[PoiTableEntry]] quickly. The dictionary is either created for
     * the `name` property of the [[PoiTableEntry]], which will identify POI, or for all of
     * alternative the names defined in `altNames` of [[PoiTableEntry]] JSON object.
     * Value assigned to key it is the index to [[poiList]] array which contain actual
     * [[PoiTabelEntry]] objects.
     */
    private readonly poiDict: Map<string, number> = new Map();
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
     * Gets [[PoiTableEntry]] for poi name specified.
     *
     * @param poiName - poi name or one of its alternative names if [[useAltNamesForKey]] is
     * set to `true`.
     * @returns [[PoiTableEntry]] object or undefined if name was not found in dictionary.
     */
    getEntry(poiName: string): PoiTableEntry | undefined {
        const entryIdx: number | undefined = this.poiDict.get(poiName);
        if (entryIdx !== undefined) {
            if (entryIdx < this.poiList.length) {
                return this.poiList[entryIdx];
            } else {
                throw new Error("Poi table entry index out of stored list!");
            }
        }
        return undefined;
    }

    /**
     * Start to load the PoiTable from the specified URL. Can only be called once per table.
     *
     * @param {string} poiTableUrl URL that points to the JSON file.
     * @param {AbortSignal} abortSignal Signal to abort the loading of the poi table file
     *
     * @returns {Promise<boolean>} Promise is being resolved once the JSON file has been fetched and
     *          the `PoiTable` has been set up.
     */
    async load(poiTableUrl: string, abortSignal?: AbortSignal): Promise<boolean> {
        if (this.m_loadedOk !== undefined) {
            // Only load once.
            return true;
        }

        this.m_loadedOk = false;

        const response = await fetch(poiTableUrl, { signal: abortSignal });

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
            logger.debug(`load: Loading POI table '${poiTableUrl}' for table '${this.name}'`);

            if (jsonPoiTable.poiList !== undefined && Array.isArray(jsonPoiTable.poiList)) {
                for (const tableEntry of jsonPoiTable.poiList) {
                    if (PoiTableEntry.verifyJSON(tableEntry)) {
                        const newPoiEntry = new PoiTableEntry();
                        newPoiEntry.setup(tableEntry);
                        const entryIdx = this.poiList.push(newPoiEntry) - 1;

                        if (!this.useAltNamesForKey) {
                            // Use actual name of entry as the key
                            if (newPoiEntry.name === undefined) {
                                logger.warn(
                                    `load: Invalid entry in POI table '${poiTableUrl}' : ` +
                                        `. No name set in entry: ${tableEntry}.`
                                );
                            } else {
                                this.poiDict.set(newPoiEntry.name, entryIdx);
                            }
                        } else {
                            if (
                                newPoiEntry.altNames !== undefined &&
                                newPoiEntry.altNames.length > 0
                            ) {
                                // Use the list of alternative names as keys.
                                for (const altName of newPoiEntry.altNames) {
                                    this.poiDict.set(altName, entryIdx);
                                }
                            } else {
                                logger.debug(
                                    `load: Invalid entry in POI table '${poiTableUrl}' : ` +
                                        `No alternative names set in entry: ${JSON.stringify(
                                            tableEntry
                                        )}.`
                                );
                            }
                        }
                    } else {
                        logger.warn(
                            `load: Invalid entry in POI table '${poiTableUrl}' : ${JSON.stringify(
                                tableEntry
                            )}`
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
 * The `PoiTableManager` manages the list of [[PoiTables]] that
 * can be defined in the {@link @here/harp-datasource-protocol#Theme} sfile.
 */
export class PoiTableManager {
    private m_isLoading = false;
    private m_poiTables: Map<string, PoiTable> = new Map();
    private readonly m_abortControllers: Map<string, AbortController> = new Map();

    /**
     * Creates an instance of PoiTableManager.
     * @param {MapView} mapView Owning {@link MapView}.
     */
    constructor(readonly mapView: MapView) {}

    /**
     * Load the {@link PoiTable}s that are stored in the {@link MapView}s
     * {@link @here/harp-datasource-protocol#Theme}.
     *
     * @remarks
     * Note that duplicate names of {@link PoiTable}s in the
     * {@link @here/harp-datasource-protocol#Theme} will lead to inaccessible {@link PoiTable}s.
     *
     * @param poiTables - {@link @here/harp-datasource-protocol#PoiTableRef[]}
     *                containing all {@link PoiTable}s to load.
     *
     * @returns Resolved once all the {@link PoiTable}s in
     *          the {@link @here/harp-datasource-protocol#Theme} have been loaded.
     */
    async loadPoiTables(poiTables?: PoiTableRef[]): Promise<void> {
        const finished = new Promise<void>(resolve => {
            this.clear();

            // Add the POI tables defined in the theme.
            if (poiTables !== undefined) {
                this.startLoading();

                // Gather promises to signal the success of having loaded them all
                const loadPromises: Array<Promise<boolean>> = new Array();

                poiTables.forEach((poiTableRef: PoiTableRef) => {
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
                            this.m_abortControllers.set(poiTableRef.name, new AbortController());
                            loadPromises.push(
                                poiTable.load(
                                    poiTableRef.url,
                                    this.m_abortControllers.get(poiTableRef.name)?.signal
                                )
                            );
                        } else {
                            logger.error(`POI table definition has no valid url: ${poiTableRef}`);
                        }
                    } else {
                        logger.error(`POI table definition has no valid name: ${poiTableRef}`);
                    }
                });

                if (loadPromises.length > 0) {
                    Promise.all(loadPromises).finally(() => {
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
     * Clear the list of {@link PoiTable}s.
     */
    clear() {
        this.m_poiTables = new Map();
        this.m_abortControllers.forEach((abortController, name) => {
            abortController.abort();
            this.m_abortControllers.delete(name);
        });
    }

    /**
     * Return the map of {@link PoiTable}s.
     */
    get poiTables(): Map<string, PoiTable> {
        return this.m_poiTables;
    }

    /**
     * Manually add a {@link PoiTable}. Normally, the [[PoiTables]]s
     * are specified in the {@link @here/harp-datasource-protocol#Theme}.
     *
     * @remarks
     * Ensure that the name is unique.
     */
    addTable(poiTable: PoiTable) {
        this.m_poiTables.set(poiTable.name, poiTable);
    }

    /**
     * Retrieve a {@link PoiTable} by name.
     *
     * @param {(string | undefined)} poiTableName Name of the {@link PoiTable}.
     *
     * @returns {(PoiTable | undefined)} The found [[poiTable]] if it could be found, `undefined`
     *          otherwise.
     */
    getPoiTable(poiTableName: string | undefined): PoiTable | undefined {
        return poiTableName === undefined ? undefined : this.m_poiTables.get(poiTableName);
    }

    /**
     * Return `true` if the {@link PoiTable}s have finished loading.
     *
     * @readonly
     */
    get finishedLoading(): boolean {
        return !this.m_isLoading;
    }

    private startLoading() {
        this.m_isLoading = true;
    }

    private finishLoading() {
        this.m_isLoading = false;
    }
}
