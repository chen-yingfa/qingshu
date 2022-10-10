/**
 * Insert a string `to_insert` into another string `s` at given index.
 */
export function strInsert(s: string, to_insert: string, index: number): string {
    return s.slice(0, index) + to_insert + s.slice(index)
}

/**
 * Enclose a selected range with text before and after
 */
export function strEnclose(s: string, range: Range, textAtStart: string, textAtEnd: string): string {
    return s.slice(0, range.startOffset) + textAtStart + s.slice(range.startOffset, range.endOffset) + 
        textAtEnd + s.slice(range.endOffset)
}


export function isAlpha(str: String): boolean {
    let bool = str.length === 1 && str.match(/[a-z]/i) != null;
    return bool
}