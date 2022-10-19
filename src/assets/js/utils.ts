/**
 * Insert a string `to_insert` into another string `s` at given index.
 */
export function strInsert(s: string, to_insert: string, index: number): string {
    return strSlice(s, 0, index) + to_insert + strSlice(s, index)
}

/**
 * Enclose a selected range with text before and after
 */
export function strEnclose(s: string, range: Range, textAtStart: string, textAtEnd: string): string {
    return strSlice(s, 0, range.startOffset) + textAtStart + strSlice(s, range.startOffset, range.endOffset) +
        textAtEnd + strSlice(s, range.endOffset)
}


export function isAlpha(str: string): boolean {
    let bool = str.length === 1 && str.match(/[a-z]/i) != null;
    return bool
}

/**
 * Check whether a char is a valid input char.
 */
export function isInputChar(str: string): boolean {
    if (str.length != 1) return false
    let charCode = str.charCodeAt(0)
    if (32 <= charCode && charCode <= 126) return true
    return false
}

export function strRemoveChar(str: string, index: number): string {
    return strSlice(str, 0, index) + strSlice(str, index + 1)
}

export function strSlice(str: string, lo: number, hi: number | null = null): string {
    if (hi == null) hi = str.length
    return [...str].slice(lo, hi).join('')
}
