export interface CaretPos {
    row: number;
    col: number;
}

export class CaretUtils {
    static getCaretPos(parentElement: HTMLDivElement) {
        let sel = window.getSelection() as Selection
        let charCount = -1
        let node

        if (sel.focusNode) {
            if (this._isChildOf(sel.focusNode, parentElement)) {
                node = sel.focusNode
                charCount = sel.focusOffset

                while (node) {
                    if (node === parentElement) {
                        break
                    }

                    if (node.previousSibling) {
                        node = node.previousSibling
                        charCount += node.textContent?.length as number
                    } else {
                        node = node.parentNode
                        if (node === null) {
                            break;
                        }
                    }
                }
            }
        }

        return charCount;
    }

    static setCaretPos(
        div: HTMLDivElement, pos: number
    ) {
        if (pos >= 0) {
            div.focus()
            var sel = window.getSelection();
            let range = this._createRange(div, { count: pos });
            console.log(range)
            range.collapse(true);
            sel?.removeAllRanges();
            sel?.addRange(range);
        }
    }

    /**
     * Helper function for setting the caret position in a contenteditable node.
     *
     * @param {Node} el - The contenteditable node.
     * @param pos - The position to set the caret to. This is passed as an Object
     * because there will be recursive calls to this function, and we need to
     * maintain the same object reference.
     * @param range - The range object to use. This should be null when calling
     * from outside, this will only be used for recursion.
     * @returns {Range} - The range object that was passed in, or a new range
     */
    static _createRange(
        node: Node,
        chars: { count: number },
        range: Range | null = null,
    ): Range {
        if (!range) {
            range = document.createRange()
            range.selectNode(node);
            range.setStart(node, 0);
        }
        if (chars.count == 0) {
            range.setStart(node, 0)
        } else if (node && chars.count > 0) {
            if (node.nodeType == Node.TEXT_NODE) {
                // This will only be reached in recursive calls
                let textLen = node.textContent?.length as number
                if (textLen < chars.count) {
                    chars.count -= textLen
                } else {
                    range.setStart(node, chars.count)
                    // This will break recursions
                    chars.count = 0
                }
            } else {
                for (
                    var child_idx = 0; 
                    child_idx < node.childNodes.length; 
                    child_idx++
                ) {
                    range = this._createRange(
                        node.childNodes[child_idx] as Node, chars, range)
                    if (chars.count == 0) break
                }
            }
        }
        return range
    }

    static _isChildOf(node: Node | null, parentElement: Node) {
        while (node !== null) {
            if (node === parentElement) {
                return true;
            }
            node = node.parentNode;
        }

        return false;
    }
}
