export interface CaretPos {
    row: number;
    col: number;
}

export class CaretUtils {
    // Credit: https://stackoverflow.com/a/4812022/7502914
    // static getCaretCharacterOffsetWithin(element: Node):any {
    //     var caretOffset = 0;
    //     var doc = element.ownerDocument  //  for IE 5 and 5.5 use: element.document
    //     var win = doc.defaultView || doc.parentWindow;
    //     var sel;
    //     if (typeof win.getSelection != "undefined") {
    //         sel = win.getSelection();
    //         if (sel.rangeCount > 0) {
    //             var range = win.getSelection().getRangeAt(0);
    //             var preCaretRange = range.cloneRange();
    //             preCaretRange.selectNodeContents(element);
    //             preCaretRange.setEnd(range.endContainer, range.endOffset);
    //             caretOffset = preCaretRange.toString().length;
    //         }
    //     } else if ( (sel = doc.selection) && sel.type != "Control") {
    //         var textRange = sel.createRange();
    //         var preCaretTextRange = doc.body.createTextRange();
    //         preCaretTextRange.moveToElementText(element);
    //         preCaretTextRange.setEndPoint("EndToEnd", textRange);
    //         caretOffset = preCaretTextRange.text.length;
    //     }
    //     return caretOffset;
    // }
    static getCaretPos(parentElement: HTMLDivElement): number {
        let sel = window.getSelection() as Selection
        let charCount = -1
        let node
        if (sel.focusNode) {
            if (this._isChildOf(sel.focusNode, parentElement)) {
                node = sel.focusNode
                charCount = sel.focusOffset
                while (node) {
                    if (node === parentElement) break

                    if (node.previousSibling) {
                        node = node.previousSibling
                        charCount += node.textContent?.length as number
                    } else {
                        node = node.parentNode
                        if (node === null) break
                    }
                }
            }
        }
        return charCount
    }

    static setCaretPos(
        div: HTMLDivElement, pos: number
    ): void {
        if (pos >= 0) {
            div.focus()
            var sel = window.getSelection();
            let range = this._createRange(div, { count: pos });
            range.collapse(true);
            sel?.removeAllRanges();
            sel?.addRange(range);
        } else {
            console.error('Attempted to set caret position:', pos);
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
        pos: { count: number },
        range: Range | null = null,
    ): Range {
        if (!range) {
            range = document.createRange()
            range.selectNode(node);
            range.setStart(node, 0);
        }
        if (pos.count == 0) {
            range.setStart(node, 0)
        } else if (node && pos.count > 0) {
            if (node.nodeType == Node.TEXT_NODE) {
                // This will only be reached in recursive calls
                let textLen = node.textContent?.length as number
                if (textLen < pos.count) {
                    pos.count -= textLen
                } else {
                    range.setStart(node, pos.count)
                    // This will break recursions
                    pos.count = 0
                }
            } else {
                for (
                    var child_idx = 0; 
                    child_idx < node.childNodes.length; 
                    child_idx++
                ) {
                    range = this._createRange(
                        node.childNodes[child_idx] as Node, pos, range)
                    if (pos.count == 0) break
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
