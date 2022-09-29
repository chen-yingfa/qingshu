const { marked } = require('marked');
const { clipboard } = require('electron');

var ROOT_CONTAINER: HTMLDivElement;
var INPUT_CONTAINER: HTMLDivElement;
var PREVIEW_CONTAINER: HTMLDivElement;
var lastFocusBlock: HTMLDivElement;
var INDENT_LEN = 4;
var FIRST_BLOCK: HTMLDivElement;
var lastFocusBlock: HTMLDivElement;

var inputBlocks: Array<HTMLDivElement>;

// TODO: Each input block should save its own copy of MD text and caret pos.
// Should wrap this into a `InputBlock` class.
var curBlock: HTMLDivElement;  // The block that user is focusing.
var mdText: string;
var caretPos: number;

/**
 * Initialize all global variables
 */
function initGlobals() {
    ROOT_CONTAINER = document.getElementById('root-container') as HTMLDivElement;
    INPUT_CONTAINER = document.getElementById('input-container') as HTMLDivElement;
    PREVIEW_CONTAINER = document.getElementById('preview-container') as HTMLDivElement;
    inputBlocks = [];

    curBlock = null;  // Means that there is no current active input block.
    caretPos = 0;
    mdText = "";
}


function initListeners() {
    // No default listeners
    INPUT_CONTAINER.addEventListener('click', onInputContainerClick);
}


/**
 * If the click happens below all input blocks, 
 * move caret to the end of last input block.
 */
function onInputContainerClick(event: MouseEvent) {
    let blocks = INPUT_CONTAINER.children;
    let lastBlock = blocks[blocks.length] as HTMLDivElement;
    setCaretPos(lastBlock, lastBlock.textContent.length);
}


function onPaste(event: ClipboardEvent) {
    event.preventDefault();
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
            let newBlock = newInputBlock();
            INPUT_CONTAINER.insertBefore(newBlock, curBlock.nextSibling);
            newBlock.textContent = pasteLines[i];
            curBlock = newBlock;
        }

        render();
    }
}



function onFocusBlock(event: FocusEvent) {
    curBlock = event.target as HTMLDivElement;
}


/**
 * Insert a string `to_insert` into another string `s` at given index.
 */
function strInsert(s: string, to_insert: string, index: number): string {
    return s.slice(0, index) + to_insert + s.slice(index);
}

/**
 * All user input should first pass through this function.
 * This should check for hotkeys, special inputs, etc.
 * This should also intercept all default hotkeys of Chromium.
 */
function onInputBlockKeydown(event: KeyboardEvent) {
    // For ignoring all keydown events that are part of IMO composition
    if (event.isComposing || event.key == 'Process') return;

    switch (event.key) {
        case 'Enter':
            onInputEnter(event);
            break;
        case 'ArrowUp':
            onInputArrowUp(event);
            break;
        case 'ArrowDown':
            onInputArrowDown(event);
            break;
        case 'ArrowLeft':
            onArrowLeft(event);
            break;
        case 'ArrowRight':
            onArrowRight(event);
            break;
        case 'Tab':
            onInputTab(event);
            break;
        case 'Backspace':
            onBackspace(event);
            break;
        case 'Escape':
            onEscape(event);
            break;
    }
}

function onEscape(event: KeyboardEvent) {
    let curBlock = event.target as HTMLDivElement;
    curBlock.blur();
    event.stopPropagation();
    event.preventDefault();
}

function onArrowLeft(event: KeyboardEvent) {
    console.log('Arrow left');
    let caretPos = getCaretPos();
    // Move to end of previous block if caret is at the beginning of this block.
    if (caretPos == 0) {
        let prevBlock = curBlock.previousSibling as HTMLDivElement;
        if (prevBlock) {
            setCaretPos(prevBlock, prevBlock.textContent.length);
            event.stopPropagation();
            event.preventDefault();
        }
    }
}

function onArrowRight(event: KeyboardEvent) {
    let caretPos = getCaretPos();
    let curBlock = event.target as HTMLDivElement;
    // Move to beginning of next block if caret is at the end of this block.
    if (caretPos == curBlock.textContent.length) {
        let nextBlock = curBlock.nextSibling as HTMLDivElement;
        if (nextBlock) {
            setCaretPos(nextBlock, 0);
            event.stopPropagation();
            event.preventDefault();
        }
    }
}

function onBackspace(event: KeyboardEvent) {
    let caretPos = getCaretPos();
    let curBlock = event.target as HTMLDivElement;
    
    // Concatenate this block and previous block if the caret is on index 0.
    if (caretPos == 0) {
        if (curBlock != FIRST_BLOCK) {
            let curText = curBlock.textContent;
            let prevBlock = curBlock.previousSibling as HTMLDivElement;
            let prevText = prevBlock.textContent;
            prevBlock.textContent = prevText + curText;
            INPUT_CONTAINER.removeChild(curBlock);
            prevBlock.focus();
            setCaretPos(prevBlock, prevText.length);
            event.stopPropagation();
            event.preventDefault();
        }
    }
}

function onInputBlockKeyup(event: KeyboardEvent) {
    // For ignoring all keydown events that are part of IMO composition
    if (event.isComposing || event.key == 'Process') return;
    
    render();
}

/**
 * Render current MD text into HTML and fill the preview container 
 * with Rendered HTML.
 */
function render() { 
    /**
     * Concatenate text of all input blocks
     */
    let mdText = "";
    let blockElems = INPUT_CONTAINER.children;
    for (let i = 0; i < blockElems.length; i++) {
        let line = blockElems[i].textContent;
        mdText += line + '\n\n';
    }
    let html = marked(mdText);
    document.getElementById("md-container").innerHTML = html;

    updateCaretStatus();
}



function updateCaretStatus() {
    // Line number
    let curBlock = getCurInputBlock();
    let row = Array.from(INPUT_CONTAINER.children).indexOf(curBlock);
    document.getElementById('caret-row-number').textContent = (row + 1).toString();

    // Column number
    let caretPos = getCaretPos();
    let caretPosElem = document.getElementById('caret-col-number') as HTMLSpanElement;
    caretPosElem.innerText = caretPos.toString();
}

function getCurInputBlock() {
    // Get the div that is begin focused
    let curBlock = document.activeElement as HTMLDivElement;
    return curBlock;
}

function newInputBlock(): HTMLDivElement {
    let newBlock = document.createElement('div');
    newBlock.id = 'input-block';
    newBlock.contentEditable = 'true';
    newBlock.classList.add('input-block');
    newBlock.addEventListener('keydown', onInputBlockKeydown);
    newBlock.addEventListener('keyup', onInputBlockKeyup);
    newBlock.addEventListener('paste', onPaste);
    newBlock.addEventListener('focus', onFocusBlock);
    return newBlock;
}

function onInputEnter(event: KeyboardEvent) {
    let curBlock = event.target as HTMLDivElement;

    /**
     * Slice the current block into two blocks.
     */
    let caretPos = getCaretPos();
    let curText = curBlock.textContent;
    let textBefore = curText.slice(0, caretPos);
    let textAfter = curText.slice(caretPos, curText.length);
    curBlock.textContent = textBefore;
    
    let newBlock = newInputBlock();
    newBlock.textContent = textAfter;
    INPUT_CONTAINER.insertBefore(newBlock, curBlock.nextSibling);
    newBlock.focus();
    event.preventDefault();
}

function onInputArrowDown(event: KeyboardEvent) {
    console.log('Down arrow pressed');
    // Move cursor to next input block
    let curBlock = event.target as HTMLDivElement;
    let caretPos = getCaretPos();
    // Move to the beginning of next block if the caret is at the end of this block.
    if (caretPos == curBlock.textContent.length) {
        let nextBlock = curBlock.nextSibling as HTMLDivElement;
        if (nextBlock) {
            setCaretPos(nextBlock, 0);
            event.stopPropagation();
            event.preventDefault();
        }
    }
}

function onInputArrowUp(event: KeyboardEvent) {
    console.log('Up arrow pressed');
    // Move cursor to previous input block
    let curBlock = event.target as HTMLDivElement;
    let caretPos = getCaretPos();
    // Move to the end of previous block if caret is at the beginning of this block.
    if (caretPos == 0) {
        let prevBlock = curBlock.previousSibling as HTMLDivElement;
        if (prevBlock) {
            setCaretPos(prevBlock, prevBlock.textContent.length);
            event.stopPropagation();
            event.preventDefault();
        }
    }
}


/**
 * Triggered when TAB is pressed on an input block.
 * Should insert 4 spaces at caret.
 */
function onInputTab(event: KeyboardEvent) {
    event.preventDefault();
    event.stopPropagation();

    let curBlock = event.target as HTMLDivElement;
    let indentStr = '        '.substring(0, INDENT_LEN);  // INDENT_LEN * ' '

    let curText = curBlock.textContent;
    let caretPos = getCaretPos();

    console.log('Tab pressed');
    console.log(curText);
    console.log('Caret pos: ' + caretPos);

    curText = strInsert(curText, indentStr, caretPos);
    caretPos += INDENT_LEN;

    curBlock.textContent = curText;
    setCaretPos(curBlock, caretPos);

    console.log('Tab pressed');
    console.log(curText);
    console.log('Caret pos: ' + caretPos);
}

function initFirstBlock() {
    FIRST_BLOCK = newInputBlock();
    INPUT_CONTAINER.appendChild(FIRST_BLOCK);
    FIRST_BLOCK.focus();
    inputBlocks.push(FIRST_BLOCK);
}


function getCaretPos() {
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
function setCaretPos(elem: HTMLDivElement, index: number) {
    elem.focus();
    let sel = window.getSelection();
    let range = document.createRange();
    range.setStart(elem.childNodes[0], index);
    range.collapse(true);

    sel.removeAllRanges();
    sel.addRange(range);

}

initGlobals();
initListeners();
initFirstBlock();
render()
