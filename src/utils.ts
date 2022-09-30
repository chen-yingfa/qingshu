/**
 * Insert a string `to_insert` into another string `s` at given index.
 */
export function strInsert(s: string, to_insert: string, index: number): string {
    return s.slice(0, index) + to_insert + s.slice(index);
}


export function isAlpha(str) {
    return str.length === 1 && str.match(/[a-z]/i);
}