const { marked } = require('marked');
const { clipboard } = require('electron');
import { BlockManager } from "./blockManager";
const { loadAndTypeset } = require("mathjax-electron");
const { strInsert, isAlpha } = require('./utils');

let keybindings = require('./keybindings.json');

export class Editor {
    /**
     * Settings
     */
    INDENT_LEN: number = 4;

    /**
     * Global variables
     */
    // ROOT_CONTAINER: HTMLDivElement;
    BLOCK_CONTAINER: HTMLDivElement;
    // PREVIEW_CONTAINER: HTMLDivElement;
    BLOCK_MANAGER: BlockManager;

    constructor() {
        console.log('Editor constructor');
        this.initGlobals();
        this.initListeners();
        let firstBlock = this.BLOCK_MANAGER.initFirstBlock();
        this.renderAll()
        firstBlock.focus();
    }

    /**
     * Initialize all global variables
     */
    initGlobals() {
        // this.ROOT_CONTAINER = document.getElementById('root-container') as HTMLDivElement;
        this.BLOCK_CONTAINER = document.getElementById('input-container') as HTMLDivElement;
        // this.PREVIEW_CONTAINER = document.getElementById('preview-container') as HTMLDivElement;
        this.BLOCK_MANAGER = new BlockManager(this, this.BLOCK_CONTAINER);
    }

    initListeners() {
        // No default listeners
        this.BLOCK_CONTAINER.onclick = this.onInputContainerClick.bind(this);
    }

    /**
     * If the click happens below all input blocks, 
     * move caret to the end of last input block.
     */
    onInputContainerClick(event: MouseEvent) {
        let lastBlock = this.BLOCK_MANAGER.getLastBlock();
        this.setCaretPos(lastBlock, lastBlock.textContent.length);
    }

    onClickInputBlock(event: MouseEvent) {
        let curBlock = event.target as HTMLDivElement;
        curBlock.focus();
        event.stopPropagation();
        event.preventDefault();
    }

    onPaste(event: ClipboardEvent) {
        event.preventDefault();
        let curBlock = event.target as HTMLDivElement;
        if (curBlock) {
            console.log('Pasting');
            const clipboardText = clipboard.readText();
            // const clipboardData = event.clipboardData.getData('text');
            let sel = window.getSelection();
            let range = sel.getRangeAt(0);

            /**
             * Scan the clipboard text, for all '\n', create a new line (new <div>)
             * Then paste the remaining text into that div and repeat recursively.
             */
            // let lineDiv = range.commonAncestorContainer.parentElement;
            let curText = curBlock.textContent;
            let caretPos = range.startOffset;

            let textBefore = curText.slice(0, caretPos);
            let textAfter = curText.slice(caretPos, curText.length);
            console.log(textBefore, textAfter);
            let pasteLines = clipboardText.split('\n');
            pasteLines[0] = textBefore + pasteLines[0];
            pasteLines[pasteLines.length - 1] += textAfter;
            console.log(pasteLines);

            curBlock.textContent = pasteLines[0];
            for (let i = 1; i < pasteLines.length; i++) {
                let newBlock = this.BLOCK_MANAGER.createBlockAfter(curBlock);
                newBlock.textContent = pasteLines[i];
                curBlock = newBlock;
            }

            this.renderAll();
        }
    }

    onFocusBlock(event: FocusEvent) {
        // ...
    }

    /**
     * All user input should first pass through this function.
     * This should check for hotkeys, special inputs, etc.
     * This should also intercept all default hotkeys of Chromium.
     */
    onInputBlockKeydown(event: KeyboardEvent) {
        // For ignoring all keydown events that are part of IMO composition
        if (event.isComposing || event.key == 'Process') return;

        switch (event.key) {
            case 'Enter':
                this.onInputEnter(event);
                break;
            case 'ArrowUp':
                this.onInputArrowUp(event);
                break;
            case 'ArrowDown':
                this.onInputArrowDown(event);
                break;
            case 'ArrowLeft':
                this.onInputArrowLeft(event);
                break;
            case 'ArrowRight':
                this.onInputArrowRight(event);
                break;
            case 'Tab':
                this.onInputTab(event);
                break;
            case 'Backspace':
                this.onInputBackspace(event);
                break;
            case 'Escape':
                this.onInputEscape(event);
                break;
            default:
                if (isAlpha(event.key)) {
                    this.onInputAlpha(event);
                }
                break;
        }
    }

    onInputAlpha(event: KeyboardEvent) {
        /**
         * Check if the input matches any keybindings specified in "keybindings.json".
         */
        if (event.ctrlKey) {
            let keyName = `ctrl`;
            if (event.shiftKey) {
                keyName += '+shift';
            }
            keyName += '+' + event.key.toUpperCase();
            console.log(keyName);
            if (keyName in keybindings) {
                let action = keybindings[keyName] + '()';
                console.log('evaluating:', action);
                eval(action);
            }
            event.stopPropagation();
            event.preventDefault();
        }

    }

    onInputEscape(event: KeyboardEvent) {
        let curBlock = event.target as HTMLDivElement;
        curBlock.blur();
        event.stopPropagation();
        event.preventDefault();
    }

    onInputArrowLeft(event: KeyboardEvent) {
        console.log('Arrow left');
        let curBlock = event.target as HTMLDivElement;
        let caretPos = this.getCaretPos(curBlock);
        // Move to end of previous block if caret is at the beginning of this block.
        if (caretPos == 0) {
            let prevBlock = curBlock.previousSibling as HTMLDivElement;
            if (prevBlock) {
                this.setCaretPos(prevBlock, prevBlock.textContent.length);
                event.stopPropagation();
                event.preventDefault();
            }
        }
    }

    onInputArrowRight(event: KeyboardEvent) {
        let curBlock = event.target as HTMLDivElement;
        let caretPos = this.getCaretPos(curBlock);
        // Move to beginning of next block if caret is at the end of this block.
        if (caretPos == curBlock.textContent.length) {
            let nextBlock = curBlock.nextSibling as HTMLDivElement;
            if (nextBlock) {
                this.setCaretPos(nextBlock, 0);
                event.stopPropagation();
                event.preventDefault();
            }
        }
    }

    onInputBackspace(event: KeyboardEvent) {
        let curBlock = event.target as HTMLDivElement;
        let caretPos = this.getCaretPos(curBlock);

        // Concatenate this block and previous block if the caret is on index 0.
        if (caretPos == 0) {
            if (curBlock != this.BLOCK_MANAGER.getFirstBlock()) {
                let curText = curBlock.textContent;
                let prevBlock = curBlock.previousSibling as HTMLDivElement;
                let prevText = prevBlock.textContent;
                prevBlock.textContent = prevText + curText;
                this.BLOCK_MANAGER.removeBlock(curBlock);
                this.setCaretPos(prevBlock, prevText.length);
                event.stopPropagation();
                event.preventDefault();
            }
        }
    }

    onInputBlockKeyup(event: KeyboardEvent) {
        // For ignoring all keydown events that are part of IMO composition
        if (event.isComposing || event.key == 'Process') return;

        this.renderAll();
    }

    /**
     * This will be called by evaluating a value string in "keybindings.json".
     */
    insertItalic() {
        let curBlock = this.BLOCK_MANAGER.getFocusedBlock();
        console.log(curBlock);
        if (!curBlock) return;
        
        let caretPos = this.getCaretPos(curBlock);
        this.insertTextAtCaret(curBlock, '**');
        this.setCaretPos(curBlock, caretPos + 1);
    }

    /**
     * This will be called by evaluating a value string in "keybindings.json".
     */
    insertBold() {
        let curBlock = this.BLOCK_MANAGER.getFocusedBlock();
        console.log(curBlock);
        if (!curBlock) return;
        
        let caretPos = this.getCaretPos(curBlock);
        this.insertTextAtCaret(curBlock, '****');
        this.setCaretPos(curBlock, caretPos + 2);
    }

    /**
     * Render current MD text into HTML and fill the preview container 
     * with Rendered HTML.
     * 
     * This will render each input block individually, then combine the HTML 
     * result.
     */
    renderAll() {
        /**
         * Loop through each input block, concatenate the HTML result.
         */
        let htmlResult = "";
        let numBlocks = this.BLOCK_MANAGER.getBlockCount();
        for (let i = 0; i < numBlocks; i++) {
            let block = this.BLOCK_MANAGER.getBlock(i);
            let md = block.textContent;
            htmlResult += '\n\n' + marked(md);
        }
        let mdContainer = document.getElementById('md-container') as HTMLDivElement;
        mdContainer.innerHTML = htmlResult;
        // console.log('rendering with MathJax');
        loadAndTypeset(document, mdContainer);
        // typesetMath(mdContainer);

        this.updateCaretStatus();
    }

    /**
     * Insert text to given block at caret position.
     */
    insertTextAtCaret(block: HTMLDivElement, text: string) {
        let caretPos = this.getCaretPos(block);
        if (caretPos != -1) {
            let sel = window.getSelection();
            let range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(text));
        }
    }

    onInputEnter(event: KeyboardEvent) {
        event.preventDefault();
        event.stopPropagation();
        let curBlock = event.target as HTMLDivElement;
        let curText = curBlock.textContent;
        let caretPos = this.getCaretPos(curBlock);

        /**
         * Handle math block
         */
        if (curBlock.classList.contains('input-block-math')) {
            /**
             * Handle leaving latex mode
             * 
             * Leave if pressed CTRL + ENTER or if the caret is at the end of the block.
             */

            if (event.ctrlKey || caretPos == curText.length) {
                // Create new text block below
                let newBlock = this.BLOCK_MANAGER.newBlock();
                this.BLOCK_MANAGER.insertBlockAfter(newBlock, curBlock);
                newBlock.focus();
            }
            return;
        }
        /**
         * Handle creation of math block
         */
        if (curText == '$$' || curText == '￥￥') {
            // Turn this into a math block.
            curBlock.textContent =  '$$\n\n$$';
            this.setCaretPos(curBlock, 3);
            
            curBlock.classList.add('input-block-math');
            return;
        }

        /**
         * Handle regular text.
         * Slice the current block into two blocks.
         */
        let textBefore = curText.slice(0, caretPos);
        let textAfter = curText.slice(caretPos, curText.length);
        curBlock.textContent = textBefore;

        let newBlock = this.BLOCK_MANAGER.newBlock();
        this.BLOCK_MANAGER.insertBlockAfter(newBlock, curBlock);
        newBlock.textContent = textAfter;
        newBlock.focus();
    }

    onInputArrowDown(event: KeyboardEvent) {
        // Move cursor to next input block
        let curBlock = event.target as HTMLDivElement;
        let caretPos = this.getCaretPos(curBlock);
        // Move to the beginning of next block if the caret is at the end of this block.
        if (caretPos == curBlock.textContent.length) {
            let nextBlock = curBlock.nextSibling as HTMLDivElement;
            if (nextBlock) {
                this.setCaretPos(nextBlock, 0);
                event.stopPropagation();
                event.preventDefault();
            }
        }
    }

    onInputArrowUp(event: KeyboardEvent) {
        console.log('Up arrow pressed');
        // Move cursor to previous input block
        let curBlock = event.target as HTMLDivElement;
        let caretPos = this.getCaretPos(curBlock);
        // Move to the end of previous block if caret is at the beginning of this block.
        if (caretPos == 0) {
            let prevBlock = curBlock.previousSibling as HTMLDivElement;
            if (prevBlock) {
                this.setCaretPos(prevBlock, prevBlock.textContent.length);
                event.stopPropagation();
                event.preventDefault();
            }
        }
    }

    /**
     * Triggered when TAB is pressed on an input block.
     * Should insert 4 spaces at caret.
     */
    onInputTab(event: KeyboardEvent) {
        event.preventDefault();
        event.stopPropagation();

        let curBlock = event.target as HTMLDivElement;
        let indentStr = '        '.substring(0, this.INDENT_LEN);  // INDENT_LEN * ' '

        let curText = curBlock.textContent;
        let caretPos = this.getCaretPos(curBlock);

        console.log('Tab pressed');
        console.log(curText);
        console.log('Caret pos: ' + caretPos);

        curText = strInsert(curText, indentStr, caretPos);
        caretPos += this.INDENT_LEN;

        curBlock.textContent = curText;
        this.setCaretPos(curBlock, caretPos);

        console.log('Tab pressed');
        console.log(curText);
        console.log('Caret pos: ' + caretPos);
    }

    /**
     * Get the pos of caret in `block`, if it does not have the caret, return null.
     */
    getCaretPos(block: HTMLDivElement): number | null {
        if (block == this.BLOCK_MANAGER.getFocusedBlock()) {
            let sel = window.getSelection();
            let range = sel.getRangeAt(0);
            let caretPos = range.startOffset;
            return caretPos;
        } else {
            return null;
        }
    }

    /**
     * Set the caret pos onto given element at given index.
     * This will focus the element if it's not focused. 
     * 
     * @param elem The element to set caret pos on. It should be an input block.
     * @param index The index to set caret pos to
     */
    setCaretPos(elem: HTMLDivElement, index: number) {
        elem.focus();
        let sel = window.getSelection();
        let range = document.createRange();
        
        range.setStart(elem.childNodes[0], index);  // childNodes[0] is the text node
        range.collapse(true);

        sel.removeAllRanges();
        sel.addRange(range);
    }

    /**
     * Update the caret status in the status bar (bottom right).
     */
    updateCaretStatus() {
        let row = 0;
        let col = 0;
        let curBlock = this.BLOCK_MANAGER.getFocusedBlock();
        if (curBlock) {
            row = this.BLOCK_MANAGER.getIndexOfBlock(curBlock);
            col = this.getCaretPos(curBlock);
        }
        this.setCaretStatus(row, col);
    }

    private setCaretStatus(row: number, col: number) {
        document.getElementById('caret-row-number').textContent = (row + 1).toString();
        let caretPosElem = document.getElementById('caret-col-number') as HTMLSpanElement;
        caretPosElem.innerText = col.toString();
    }
}

var editor: Editor;
editor = new Editor();