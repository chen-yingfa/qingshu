const { marked } = require('marked');
const { clipboard } = require('electron');

var INPUT_CONTAINER: HTMLDivElement;
var PREVIEW_CONTAINER: HTMLDivElement;
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
    INPUT_CONTAINER = document.getElementById('input-container') as HTMLDivElement;
    PREVIEW_CONTAINER = document.getElementById('preview-container') as HTMLDivElement;
    inputBlocks = [];

    curBlock = null;  // Means that there is no current active input block.
    caretPos = 0;
    mdText = "";
}


function initListeners() {
    // No default listeners
}



function onPaste(event: ClipboardEvent) {
    event.preventDefault();
    if (curBlock) {
        const clipboardText = clipboard.readText();
        // const clipboardData = event.clipboardData.getData('text');
        let sel = window.getSelection();
        let range = sel.getRangeAt(0);
        
        
        /**
         * Scan the clipboard text, for all '\n', create a new line (new <div>)
         * Then paste the remaining text into that div and repeat recursively.
         */
        let lineDiv = range.commonAncestorContainer.parentElement;
        let curText = lineDiv.textContent;
        let caretPos = range.startOffset;
        
        let textBefore = curText.slice(0, caretPos);
        let textAfter = curText.slice(caretPos, curText.length);
        let pasteLines = clipboardText.split('\n');
        pasteLines[0] = textBefore + pasteLines[0];
        pasteLines[pasteLines.length - 1] += textAfter;
        for (let line of pasteLines) {
            lineDiv.textContent = line;
            let newLineDiv = document.createElement('div');
            curBlock.insertBefore(newLineDiv, lineDiv.nextSibling);
            lineDiv = newLineDiv;
        }

        render();
    }
}



function onFocusBlock(event: FocusEvent) {
    curBlock = event.target as HTMLDivElement;
}

function strInsert(s: string, to_insert: string, index: number): string {
    return s.slice(0, 3) + to_insert + s.slice(3);
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
        case 'ArrowDown':
            onInputArrowDown(event);
            break;
        // case 'ArrowUp':
        //     onInputArrowUp(event);
        //     break;
        case 'Tab':
            onInputTab(event);
            break;
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
    let nextBlock = curBlock.nextSibling as HTMLDivElement;
    if (nextBlock != null) {
        nextBlock.focus();
    }
}

function onInputArrowUp(event: KeyboardEvent) {
    console.log('Up arrow pressed');
    // Move cursor to previous input block
    let curBlock = event.target as HTMLDivElement;
    let prevBlock = curBlock.previousSibling as HTMLDivElement;
    if (prevBlock != null) {
        prevBlock.focus();
    }
}

function onInputTab(event: KeyboardEvent) {
    let curBlock = event.target as HTMLDivElement;
}

function initFirstBlock() {
    let firstBlock = newInputBlock();
    INPUT_CONTAINER.appendChild(firstBlock);
    firstBlock.focus();
    firstBlock.addEventListener('paste', onPaste);
    firstBlock.addEventListener('focus', onFocusBlock);
    inputBlocks.push(firstBlock);
}


function getCaretPos() {
    let sel = window.getSelection();
    let range = sel.getRangeAt(0);
    let caretPos = range.startOffset;
    return caretPos;
}

initGlobals();
initListeners();
initFirstBlock();
render()
