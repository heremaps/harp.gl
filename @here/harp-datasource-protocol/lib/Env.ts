/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @hidden
 */
export type Value = null | boolean | number | string | object;

/**
 * @hidden
 */
export interface ValueMap {
    [name: string]: Value;
}

/**
 * @hidden
 */
export class Env {
    constructor(readonly entries: ValueMap) {}
    /**
     * Returns property in [[Env]] by name.
     *
     * @param name Name of property.
     */
    lookup(_name: string): Value | undefined {
        return undefined;
    }

    /**
     * Return an object containing all properties of this environment. (Here: empty object).
     */
    unmap(): ValueMap {
        return {};
    }
}

/**
 * Adds access to map specific environment properties.
 */
export class MapEnv extends Env {
    constructor(readonly entries: ValueMap, private readonly parent?: Env) {
        super(entries);
    }

    /**
     * Returns property in [[Env]] by name.
     *
     * @param name Name of property.
     */
    lookup(name: string): Value | undefined {
        if (this.entries.hasOwnProperty(name)) {
            const value = this.entries[name];
            if (value !== undefined) {
                return value;
            }
        }
        return this.parent ? this.parent.lookup(name) : undefined;
    }
    /**
     * Return an object containing all properties of this environment, takes care of the parent
     * object.
     */
    unmap(): ValueMap {
        const obj: any = this.parent ? this.parent.unmap() : {};
        for (const key in this.entries) {
            if (this.entries.hasOwnProperty(key)) {
                obj[key] = this.entries[key];
            }
        }
        return obj;
    }
}

export type LocaleMap = Map<string, string>;

/**
 * Allows access to map specific environment properties with support for localization.
 */
export class MapLocalEnv extends MapEnv {
    /**
     * Map that contains localized properties names with requested localization (country code).
     */
    private readonly m_locale: LocaleMap;

    constructor(entries: ValueMap, parent?: Env | undefined, locale?: LocaleMap | undefined) {
        super(entries, parent);
        this.m_locale = locale === undefined ? new Map<string, string>() : locale;
    }

    /**
     * Setup environment to prioritize localized properties before generic ones.
     *
     * @note Some map features may have properties defined in _localized_ and _generic_
     * version. The _localized_ attribute may hold for example name of the place in
     * country specific language, but it may be also the variable property that is
     * specific only for certain country point of view.
     * For example some country borders may be disputed by general community, while totally
     * accepted or claimed by some certain countries, depending on their political point of
     * view.
     * @see [ISO_3166-1_alfa-2|https://pl.wikipedia.org/wiki/ISO_3166-1_alfa-2] for more
     * info about supported country codes.
     * @param propertyName The name of property to be localized.
     * @param countryCode The country code in ISO 3166-1 alfa-2 format (two letters).
     */
    setLocale(propertyName: string, countryCode: string): void {
        // TODO: Hold compound property in form `${name}:${country}`,
        // which may greatly improve performance - no string object
        // creation at each lookup.
        this.m_locale.set(propertyName, countryCode);
    }

    /**
     * Unset localization for certain property name.
     *
     * @param propertyName The name of property that was localized.
     * @return [[true]] if property was localized, false if not.
     */
    unsetLocale(propertyName: string): boolean {
        return this.m_locale.delete(propertyName);
    }

    /**
     * Remove all properties localization.
     *
     * Only generic values of properties will be returned on [[lookup]], thus
     * from now on class will behave like simple [[MapEnv]] object.
     */
    clearLocale(): void {
        this.m_locale.clear();
    }

    /**
     * Returns localized property in [[Env]] using its name and optional country posix.
     *
     * This method supports properties localization via optional country posix that may
     * be added to property in format [[name]]:__country__. If localized property
     * is not available or property is not requested for localization returns its generic
     * value identified simply by [[name]].
     *
     * @param name Name of property.
     */
    lookup(name: string): Value | undefined {
        const country: string | undefined = this.m_locale.get(name);
        if (country !== undefined) {
            const localProp = super.lookup(`${name}:${country}`);
            if (localProp !== undefined) {
                return localProp;
            }
        }
        return super.lookup(name);
    }

    /**
     * Return an object containing all properties of this environment, takes care of the parent
     * object.
     */
    unmap(): ValueMap {
        // TODO: Consider replacing localized properties
        return super.unmap();
    }
}
