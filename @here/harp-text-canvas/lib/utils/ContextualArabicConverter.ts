/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

enum ContextualForm {
    Initial,
    Medial,
    Final
}

enum CombinedForm {
    Isolated,
    Connected
}

/**
 * Converter between arabic isolated forms (in Unicode Block 'Arabic') and their contextual forms
 * (in Unicode Block 'Arabic Presentation Forms-B').
 */
export class ContextualArabicConverter {
    private static m_instance: ContextualArabicConverter;
    static get instance(): ContextualArabicConverter {
        if (this.m_instance === undefined) {
            this.m_instance = new ContextualArabicConverter();
        }
        return this.m_instance;
    }

    private readonly m_singleCharactersMap: Map<
        number,
        ReadonlyArray<number | undefined>
    > = new Map();

    private readonly m_combinedCharactersMap: Map<
        number,
        Map<number, ReadonlyArray<number | undefined>>
    > = new Map();

    private readonly m_neutralCharacters: number[];

    private constructor() {
        // Single characters.
        this.m_singleCharactersMap.set(0x0621, [undefined, undefined, undefined]); // HAMZA
        this.m_singleCharactersMap.set(0x0622, [undefined, undefined, 0xfe82]); // ALEF_MADDA
        this.m_singleCharactersMap.set(0x0623, [undefined, undefined, 0xfe84]); // ALEF_HAMZA_ABOVE
        this.m_singleCharactersMap.set(0x0624, [undefined, undefined, 0xfe86]); // WAW_HAMZA
        this.m_singleCharactersMap.set(0x0625, [undefined, undefined, 0xfe88]); // ALEF_HAMZA_BELOW
        this.m_singleCharactersMap.set(0x0626, [0xfe8b, 0xfe8c, 0xfe8a]); // YEH_HAMZA
        this.m_singleCharactersMap.set(0x0627, [undefined, undefined, 0xfe8e]); // ALEF
        this.m_singleCharactersMap.set(0x0628, [0xfe91, 0xfe92, 0xfe90]); // BEH
        this.m_singleCharactersMap.set(0x0629, [undefined, undefined, 0xfe94]); // TEH_MARBUTA
        this.m_singleCharactersMap.set(0x062a, [0xfe97, 0xfe98, 0xfe96]); // TEH
        this.m_singleCharactersMap.set(0x062b, [0xfe9b, 0xfe9c, 0xfe9a]); // THEH
        this.m_singleCharactersMap.set(0x062c, [0xfe9f, 0xfea0, 0xfe9e]); // JEEM
        this.m_singleCharactersMap.set(0x062d, [0xfea3, 0xfea4, 0xfea2]); // HAH
        this.m_singleCharactersMap.set(0x062e, [0xfea7, 0xfea8, 0xfea6]); // KHAH
        this.m_singleCharactersMap.set(0x062f, [undefined, undefined, 0xfeaa]); // DAL
        this.m_singleCharactersMap.set(0x0630, [undefined, undefined, 0xfeac]); // THAL
        this.m_singleCharactersMap.set(0x0631, [undefined, undefined, 0xfeae]); // REH
        this.m_singleCharactersMap.set(0x0632, [undefined, undefined, 0xfeb0]); // ZAIN
        this.m_singleCharactersMap.set(0x0633, [0xfeb3, 0xfeb4, 0xfeb2]); // SEEN
        this.m_singleCharactersMap.set(0x0634, [0xfeb7, 0xfeb8, 0xfeb6]); // SHEEN
        this.m_singleCharactersMap.set(0x0635, [0xfebb, 0xfebc, 0xfeba]); // SAD
        this.m_singleCharactersMap.set(0x0636, [0xfebf, 0xfec0, 0xfebe]); // DAD
        this.m_singleCharactersMap.set(0x0637, [0xfec3, 0xfec4, 0xfec2]); // TAH
        this.m_singleCharactersMap.set(0x0638, [0xfec7, 0xfec8, 0xfec6]); // ZAH
        this.m_singleCharactersMap.set(0x0639, [0xfecb, 0xfecc, 0xfeca]); // AIN
        this.m_singleCharactersMap.set(0x063a, [0xfecf, 0xfed0, 0xfece]); // GHAIN
        this.m_singleCharactersMap.set(0x0640, [0x0640, 0x0640, 0x0640]); // TATWEEL
        this.m_singleCharactersMap.set(0x0641, [0xfed3, 0xfed4, 0xfed2]); // FEH
        this.m_singleCharactersMap.set(0x0642, [0xfed7, 0xfed8, 0xfed6]); // QAF
        this.m_singleCharactersMap.set(0x0643, [0xfedb, 0xfedc, 0xfeda]); // KAF
        this.m_singleCharactersMap.set(0x0644, [0xfedf, 0xfee0, 0xfede]); // LAM
        this.m_singleCharactersMap.set(0x0645, [0xfee3, 0xfee4, 0xfee2]); // MEEM
        this.m_singleCharactersMap.set(0x0646, [0xfee7, 0xfee8, 0xfee6]); // NOON
        this.m_singleCharactersMap.set(0x0647, [0xfeeb, 0xfeec, 0xfeea]); // HEH
        this.m_singleCharactersMap.set(0x0648, [undefined, undefined, 0xfeee]); // WAW
        this.m_singleCharactersMap.set(0x0649, [undefined, undefined, 0xfef0]); // ALEF_MAKSURA
        this.m_singleCharactersMap.set(0x064a, [0xfef3, 0xfef4, 0xfef2]); // YEH
        this.m_singleCharactersMap.set(0x067e, [0xfb58, 0xfb59, 0xfb57]); // PEH
        this.m_singleCharactersMap.set(0x06cc, [0xfbfe, 0xfbff, 0xfbfd]); // Farsi Yeh
        this.m_singleCharactersMap.set(0x0686, [0xfb7c, 0xfb7d, 0xfb7b]); // Tcheh
        this.m_singleCharactersMap.set(0x06a9, [0xfb90, 0xfb91, 0xfb8f]); // Keheh
        this.m_singleCharactersMap.set(0x06af, [0xfb94, 0xfb95, 0xfb93]); // Gaf
        this.m_singleCharactersMap.set(0x0698, [undefined, undefined, 0xfb8b]); // Jeh

        // Combined characters.
        this.m_combinedCharactersMap.set(0x0644, new Map());
        // LAM_ALEF_MADDA
        this.m_combinedCharactersMap.get(0x0644)!.set(0x0622, [0xfef5, 0xfef6]);
        // LAM_ALEF_HAMZA_ABOVE
        this.m_combinedCharactersMap.get(0x0644)!.set(0x0623, [0xfef7, 0xfef8]);
        // LAM_ALEF_HAMZA_BELOW
        this.m_combinedCharactersMap.get(0x0644)!.set(0x0625, [0xfef9, 0xfefa]);
        // LAM_ALEF
        this.m_combinedCharactersMap.get(0x0644)!.set(0x0627, [0xfefb, 0xfefc]);

        // Neutral characters.
        this.m_neutralCharacters = [
            0x0610, // ARABIC SIGN SALLALLAHOU ALAYHE WASSALLAM
            0x0612, // ARABIC SIGN ALAYHE ASSALLAM
            0x0613, // ARABIC SIGN RADI ALLAHOU ANHU
            0x0614, // ARABIC SIGN TAKHALLUS
            0x0615, // ARABIC SMALL HIGH TAH
            0x064b, // ARABIC FATHATAN
            0x064c, // ARABIC DAMMATAN
            0x064d, // ARABIC KASRATAN
            0x064e, // ARABIC FATHA
            0x064f, // ARABIC DAMMA
            0x0650, // ARABIC KASRA
            0x0651, // ARABIC SHADDA
            0x0652, // ARABIC SUKUN
            0x0653, // ARABIC MADDAH ABOVE
            0x0654, // ARABIC HAMZA ABOVE
            0x0655, // ARABIC HAMZA BELOW
            0x0656, // ARABIC SUBSCRIPT ALEF
            0x0657, // ARABIC INVERTED DAMMA
            0x0658, // ARABIC MARK NOON GHUNNA
            0x0670, // ARABIC LETTER SUPERSCRIPT ALEF
            0x06d6, // ARABIC SMALL HIGH LIGATURE SAD WITH LAM WITH ALEF MAKSURA
            0x06d7, // ARABIC SMALL HIGH LIGATURE QAF WITH LAM WITH ALEF MAKSURA
            0x06d8, // ARABIC SMALL HIGH MEEM INITIAL FORM
            0x06d9, // ARABIC SMALL HIGH LAM ALEF
            0x06da, // ARABIC SMALL HIGH JEEM
            0x06db, // ARABIC SMALL HIGH THREE DOTS
            0x06dc, // ARABIC SMALL HIGH SEEN
            0x06df, // ARABIC SMALL HIGH ROUNDED ZERO
            0x06e0, // ARABIC SMALL HIGH UPRIGHT RECTANGULAR ZERO
            0x06e1, // ARABIC SMALL HIGH DOTLESS HEAD OF KHAH
            0x06e2, // ARABIC SMALL HIGH MEEM ISOLATED FORM
            0x06e3, // ARABIC SMALL LOW SEEN
            0x06e4, // ARABIC SMALL HIGH MADDA
            0x06e7, // ARABIC SMALL HIGH YEH
            0x06e8, // ARABIC SMALL HIGH NOON
            0x06ea, // ARABIC EMPTY CENTRE LOW STOP
            0x06eb, // ARABIC EMPTY CENTRE HIGH STOP
            0x06ec, // ARABIC ROUNDED HIGH STOP WITH FILLED CENTRE
            0x06ed // ARABIC SMALL LOW MEEM
        ];
    }

    /**
     * Converts isolated arabic characters into their contextual form.
     *
     * @param input - String with isolated arabic characters.
     */
    convert(input: string): string {
        let output = "";
        for (let i = 0; i < input.length; ++i) {
            const currentCodePoint = input.charCodeAt(i);

            // Only process arabic characters in the map.
            if (this.isArabicCharacter(currentCodePoint)) {
                // Find the first previous non-neutral character.
                let prevIndex = i - 1;
                for (; prevIndex >= 0; --prevIndex) {
                    if (!this.isNeutral(input.charCodeAt(prevIndex))) {
                        break;
                    }
                }

                // Check if the previous character has ligatures with following characters.
                let prevCodePoint = prevIndex >= 0 ? input.charCodeAt(prevIndex) : undefined;
                if (prevCodePoint !== undefined) {
                    const prevMap = this.getCharacterMap(prevCodePoint);
                    if (
                        prevMap === undefined ||
                        (prevMap[ContextualForm.Initial] === undefined &&
                            prevMap[ContextualForm.Medial] === undefined)
                    ) {
                        prevCodePoint = undefined;
                    }
                }

                // Find the first next non-neutral character.
                let nextIndex = i + 1;
                for (; nextIndex < input.length; ++nextIndex) {
                    if (!this.isNeutral(input.charCodeAt(nextIndex))) {
                        break;
                    }
                }

                // Check if the next character has ligatures with previous characters.
                let nextCodePoint =
                    nextIndex < input.length ? input.charCodeAt(nextIndex) : undefined;
                if (nextCodePoint !== undefined) {
                    const nextMap = this.getCharacterMap(nextCodePoint);
                    if (
                        nextMap === undefined ||
                        (nextMap[ContextualForm.Medial] === undefined &&
                            nextMap[ContextualForm.Final] === undefined)
                    ) {
                        nextCodePoint = undefined;
                    }
                }

                // Check for Lam Alef combinated forms.
                if (
                    currentCodePoint === 0x0644 &&
                    nextCodePoint !== undefined &&
                    (nextCodePoint === 0x0622 ||
                        nextCodePoint === 0x0623 ||
                        nextCodePoint === 0x0625 ||
                        nextCodePoint === 0x0627)
                ) {
                    const combinedMap = this.getCombinedCharacterMap(
                        currentCodePoint,
                        nextCodePoint
                    )!;
                    if (prevCodePoint !== undefined) {
                        output += String.fromCharCode(combinedMap[CombinedForm.Connected]!);
                    } else {
                        output += String.fromCharCode(combinedMap[CombinedForm.Isolated]!);
                    }

                    // Skip the next character and continue.
                    ++i;
                    continue;
                }

                // Check for single character contextual forms.
                const map = this.getCharacterMap(currentCodePoint)!;
                // Intermediate.
                if (
                    prevCodePoint !== undefined &&
                    nextCodePoint !== undefined &&
                    map[ContextualForm.Medial] !== undefined
                ) {
                    output += String.fromCharCode(map[ContextualForm.Medial]!);
                }
                // Final.
                else if (prevCodePoint !== undefined && map[ContextualForm.Final] !== undefined) {
                    output += String.fromCharCode(map[ContextualForm.Final]!);
                }
                // Initial.
                else if (nextCodePoint !== undefined && map[ContextualForm.Initial] !== undefined) {
                    output += String.fromCharCode(map[ContextualForm.Initial]!);
                }
                // Isolated.
                else {
                    output += String.fromCharCode(currentCodePoint);
                }
            } else {
                output += String.fromCharCode(currentCodePoint);
            }
        }

        return output;
    }

    private isArabicCharacter(codePoint: number): boolean {
        return this.m_singleCharactersMap.has(codePoint);
    }

    private getCharacterMap(codePoint: number): ReadonlyArray<number | undefined> | undefined {
        return this.m_singleCharactersMap.get(codePoint);
    }

    private getCombinedCharacterMap(
        codePoint: number,
        nextCodePoint: number
    ): ReadonlyArray<number | undefined> | undefined {
        const map = this.m_combinedCharactersMap.get(codePoint);
        if (map !== undefined) {
            return map.get(nextCodePoint);
        }
        return undefined;
    }

    private isNeutral(codePoint: number): boolean {
        for (const character of this.m_neutralCharacters) {
            if (character === codePoint) {
                return true;
            }
        }
        return false;
    }
}
