const { marked } = require('marked');
const { clipboard } = require('electron');
// const { mathjax } = require('mathjax');
const katex = require('katex');
// import { InputBlock } from './inputBlock';
import { BlockManager } from "./blockManager";



export class Editor {
    /**
     * Settings
     */
    INDENT_LEN: number = 4;

    /**
     * Global variables
     */
    ROOT_CONTAINER: HTMLDivElement;
    BLOCK_CONTAINER: HTMLDivElement;
    PREVIEW_CONTAINER: HTMLDivElement;
    BLOCK_MANAGER: BlockManager;

    constructor() {
        console.log('Editor constructor');
        this.initGlobals();
        this.initListeners();
        this.BLOCK_MANAGER.initFirstBlock();
        this.BLOCK_MANAGER.blocks[0].focus();
        this.render()
    }

    /**
     * Initialize all global variables
     */
    initGlobals() {
        this.ROOT_CONTAINER = document.getElementById('root-container') as HTMLDivElement;
        this.BLOCK_CONTAINER = document.getElementById('input-container') as HTMLDivElement;
        this.PREVIEW_CONTAINER = document.getElementById('preview-container') as HTMLDivElement;
        this.BLOCK_MANAGER = new BlockManager(this, this.BLOCK_CONTAINER);
    }

    initListeners() {
        // No default listeners
        this.BLOCK_CONTAINER.addEventListener('click', this.onInputContainerClick);
    }

    /**
     * If the click happens below all input blocks, 
     * move caret to the end of last input block.
     */
    onInputContainerClick(event: MouseEvent) {
        let lastBlock = this.BLOCK_MANAGER.blocks.at(-1);
        this.setCaretPos(lastBlock, lastBlock.textContent.length);
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

            this.render();
        }
    }

    onFocusBlock(event: FocusEvent) {
        // ...
    }

    /**
     * Insert a string `to_insert` into another string `s` at given index.
     */
    strInsert(s: string, to_insert: string, index: number): string {
        return s.slice(0, index) + to_insert + s.slice(index);
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
        let caretPos = this.getCaretPos();
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
        let caretPos = this.getCaretPos();
        let curBlock = event.target as HTMLDivElement;
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
        let caretPos = this.getCaretPos();
        let curBlock = event.target as HTMLDivElement;

        // Concatenate this block and previous block if the caret is on index 0.
        if (caretPos == 0) {
            if (curBlock != this.BLOCK_MANAGER.blocks[0]) {
                let curText = curBlock.textContent;
                let prevBlock = curBlock.previousSibling as HTMLDivElement;
                let prevText = prevBlock.textContent;
                prevBlock.textContent = prevText + curText;
                this.BLOCK_CONTAINER.removeChild(curBlock);
                prevBlock.focus();
                this.setCaretPos(prevBlock, prevText.length);
                event.stopPropagation();
                event.preventDefault();
            }
        }
    }

    onInputBlockKeyup(event: KeyboardEvent) {
        // For ignoring all keydown events that are part of IMO composition
        if (event.isComposing || event.key == 'Process') return;

        this.render();
    }

    /**
     * Render current MD text into HTML and fill the preview container 
     * with Rendered HTML.
     * 
     * This will render each input block individually, then combine the HTML 
     * result.
     */
    render() {
        /**
         * Concatenate text of all input blocks
         */
        // let mdText = "";
        let htmlResult = "";
        // let blockElems = INPUT_CONTAINER.children;
        let numBlocks = this.BLOCK_MANAGER.blocks.length;
        for (let i = 0; i < numBlocks; i++) {
            // Math block
            let block = this.BLOCK_MANAGER.blocks[i];
            if (block.classList.contains('input-block-math')) {
                let mathText = this.BLOCK_MANAGER.blocks[i].textContent;
                mathText = mathText.substring(2, mathText.length - 2);
                console.log(mathText);
                mathText.replace('\\', '\\\\');
                try {

                    htmlResult += '\n\n' + katex.renderToString(mathText, {
                        output: 'html',
                        displayMode: true,
                    });
                    block.classList.remove('input-block-math-error');
                }
                catch (e) {
                    console.log(e);
                    block.classList.add('input-block-math-error');
                }
            } 
            // Regular text block
            else {
                let md = this.BLOCK_MANAGER.blocks[i].textContent;
                htmlResult += '\n\n' + marked(md);
            }
        }
        document.getElementById("md-container").innerHTML = htmlResult;

        this.updateCaretStatus();
    }

    updateCaretStatus() {
        // Line number
        let curBlock = this.getCurInputBlock();
        let row = Array.from(this.BLOCK_CONTAINER.children).indexOf(curBlock);
        document.getElementById('caret-row-number').textContent = (row + 1).toString();

        // Column number
        let caretPos = this.getCaretPos();
        let caretPosElem = document.getElementById('caret-col-number') as HTMLSpanElement;
        caretPosElem.innerText = caretPos.toString();
    }

    getCurInputBlock() {
        // Get the div that is begin focused
        let curBlock = document.activeElement as HTMLDivElement;
        return curBlock;
    }

    onInputEnter(event: KeyboardEvent) {
        let curBlock = event.target as HTMLDivElement;
        let curText = curBlock.textContent;

        /**
         * Handle math block
         */
        if (curBlock.classList.contains('input-block-math')) {
            /**
             * Handle leaving latex mode
             */

            // If CTRL is held down
            if (event.ctrlKey) {
                // Create new text block below
                let newBlock = this.BLOCK_MANAGER.newBlock();
                this.BLOCK_MANAGER.insertBlockAfter(newBlock, curBlock);
                newBlock.focus();
            }

            event.preventDefault();
            event.stopPropagation();
            return;
        }
        /**
         * Handle creation of math block
         */
        if (curText == '$$' || curText == '￥￥') {
            if (curText == '￥￥') {
                curBlock.textContent = '$$';
                curText = '$$';
            }
            // Turn this into a math block.
            let caretPos = this.getCaretPos();
            curBlock.classList.add('input-block-math');
            curBlock.textContent += '\n\n$$';
            this.setCaretPos(curBlock, caretPos + 1);
            
            event.stopPropagation();
            event.preventDefault();
            return;
        }

        /**
         * Handle regular text.
         * Slice the current block into two blocks.
         */
        let caretPos = this.getCaretPos();
        let textBefore = curText.slice(0, caretPos);
        let textAfter = curText.slice(caretPos, curText.length);
        curBlock.textContent = textBefore;

        let newBlock = this.BLOCK_MANAGER.newBlock();
        this.BLOCK_MANAGER.insertBlockAfter(newBlock, curBlock);
        newBlock.textContent = textAfter;
        newBlock.focus();
        event.preventDefault();
        event.stopPropagation();

        console.log('Enter pressed');
        console.log(this.BLOCK_MANAGER.blocks);
    }

    onInputArrowDown(event: KeyboardEvent) {
        // Move cursor to next input block
        let curBlock = event.target as HTMLDivElement;
        let caretPos = this.getCaretPos();
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
        let caretPos = this.getCaretPos();
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
        let caretPos = this.getCaretPos();

        console.log('Tab pressed');
        console.log(curText);
        console.log('Caret pos: ' + caretPos);

        curText = this.strInsert(curText, indentStr, caretPos);
        caretPos += this.INDENT_LEN;

        curBlock.textContent = curText;
        this.setCaretPos(curBlock, caretPos);

        console.log('Tab pressed');
        console.log(curText);
        console.log('Caret pos: ' + caretPos);
    }

    /**
     * Get the pos of caret.
     * This assumes that an input block is being focused.
     */
    getCaretPos() {
        let sel = window.getSelection();
        let range = sel.getRangeAt(0);
        let caretPos = range.startOffset;
        return caretPos;
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
        range.setStart(elem.childNodes[0], index);
        range.collapse(true);

        sel.removeAllRanges();
        sel.addRange(range);
    }
}

var EDITOR: Editor;
EDITOR = new Editor();