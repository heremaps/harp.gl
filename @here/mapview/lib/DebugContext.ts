/*
 * Copyright (C) 2018 HERE Global B.V. and its affiliate(s). All rights reserved.
 *
 * This software and other materials contain proprietary information controlled by HERE and are
 * protected by applicable copyright legislation. Any use and utilization of this software and other
 * materials and disclosure to any third parties is conditional upon having a separate agreement
 * with HERE for the access, use, utilization or disclosure of this software. In the absence of such
 * agreement, the use of the software is not allowed.
 */

import * as THREE from "three";

/**
 * Usage in Modules:
 *
 * import { DebugContext, debugContext } from "../lib/DebugContext";
 *
 * Declaring a debug option:
 * debugContext.settings.setOption("MY_DBG_OPT", "default");
 *
 * Access a option:
 * if (debugContext.settings.option("MY_DBG_OPT")) {
 *     ...
 * }
 *
 *
 * Access in browser console:
 *
 * window.__debugContext.settings.addEventListener("MY_DBG_OPT", function(event) {
 *  console.log("name:", event.type, "value:", event.value)});
 *
 */

/**
 * Allow access to the global `window` object here. Constructor of [[DebugContext]] will add the
 * instance to `window`, so it is available from the browser console.
 */

interface DebugInfo {
    __debugContext?: DebugContext;
}

const isNode = new Function("return typeof window === 'undefined' || this !== window")();

/**
 * A `DebugOption` is a pair of option value and an array of change listeners. Listeners are called
 * up when setting the option's value.
 */
class DebugOption extends THREE.EventDispatcher {
    static SET_EVENT_TYPE: string = "set";

    /**
     * Constructs the `DebugOption`.
     *
     * @param value The value of the option.
     */
    constructor(public value: any) {
        super();
    }

    /**
     * Updates the value of a given option.
     *
     * @param value The new value to set the option to.
     * @param name The name of the option to set.
     */
    set(value: any, name: string) {
        this.value = value;
        this.dispatchEvent({ type: DebugOption.SET_EVENT_TYPE, name, value });
    }
}

/**
 * Maintains a map of [[DebugOption]]s. Allows adding listeners to debug options by passing their
 * name.
 */
export class DebugContext {
    private m_optionsMap: Map<string, DebugOption>;

    /**
     * Builds a `DebugContext`.
     */
    constructor() {
        this.m_optionsMap = new Map<string, DebugOption>();

        // If we have a `window` object, we store the context in it to make it available in the
        // console.
        if (!isNode && typeof window !== "undefined" && window) {
            const debugInfo = window as DebugInfo;
            debugInfo.__debugContext = this;
        }
    }

    /**
     * Set the value of an option. Will call change listeners of that option, even if the value has
     * not been changed. Change listeners provided here is not called during this set operation.
     *
     * @param name Name of option.
     * @param value Value of option.
     */
    setValue(name: string, value: any): void {
        let opt = this.m_optionsMap.get(name);
        if (!opt) {
            opt = new DebugOption(value);
            this.m_optionsMap.set(name, opt);
        } else {
            opt.set(value, name);
        }
    }

    /**
     * Get option value.
     *
     * @param name Name of option.
     */
    getValue(name: string): any {
        const opt = this.m_optionsMap.get(name);
        return opt ? opt.value : undefined;
    }

    /**
     * Determine if the option is registered.
     *
     * @param name Name of option.
     */
    hasOption(name: string): boolean {
        return this.m_optionsMap.get(name) !== undefined;
    }

    /**
     * Adds a listener to a debug option.
     *
     * @param name Name of option that has a listener added.
     * @param listener The listener function that gets added.
     */
    addEventListener(name: string, listener: (event: THREE.Event) => void) {
        const opt = this.m_optionsMap.get(name);
        if (opt) {
            opt.addEventListener(DebugOption.SET_EVENT_TYPE, listener);
        } else {
            throw Error("Unknown option: " + name);
        }
    }

    /**
     * Checks for a listener of a debug option.
     *
     * @param name Name of option that has a listener tested.
     * @param listener The listener function that gets tested.
     */
    hasEventListener(name: string, listener: (event: THREE.Event) => void) {
        const opt = this.m_optionsMap.get(name);
        if (opt) {
            return opt.hasEventListener(DebugOption.SET_EVENT_TYPE, listener);
        } else {
            throw Error("Unknown option: " + name);
        }
    }

    /**
     * Removes a listener from a debug option.
     *
     * @param name Name of option that has a listener removed.
     * @param listener The listener function that gets removed.
     */
    removeEventListener(name: string, listener: (event: THREE.Event) => void) {
        const opt = this.m_optionsMap.get(name);
        if (opt) {
            opt.removeEventListener(DebugOption.SET_EVENT_TYPE, listener);
        } else {
            throw Error("Unknown option: " + name);
        }
    }

    /**
     * Access to the options map, useful for creating an automatic browser GUI.
     */
    get options(): Map<string, any> {
        return this.m_optionsMap;
    }

    /**
     * Clear away all debug options. Unfortunately `THREE.EventDispatcher` cannot remove all event
     * listeners.
     */
    clear() {
        this.m_optionsMap.forEach(option => {
            option.set(undefined, "");
        });
    }
}

export const debugContext = new DebugContext();
