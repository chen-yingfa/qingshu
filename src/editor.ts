
var INPUT_CONTAINER: HTMLDivElement;
var lastFocusBlock: HTMLDivElement;

function initGlobals() {
    INPUT_CONTAINER = document.getElementById('input-container') as HTMLDivElement;
}

function initListeners() {
    // When user press Enter in an input-block
    // Path: src\index.html
    let inputBlocks = document.getElementsByClassName('input-block');
    for (let i = 0; i < inputBlocks.length; i++) {
        let inputBlock = inputBlocks[i] as HTMLDivElement;
        if (inputBlock != null) {
            // inputBlock.addEventListener('keypress', onInputBlockKeyPress);
            inputBlock.addEventListener('keydown', onInputBlockKeyDown);
        }
    }
}

function onInputBlockKeyPress(event: KeyboardEvent) {
    switch (event.key) {
        case 'Enter':
            onInputEnter(event);
            break;
    }
}

function onInputBlockKeyDown(event: KeyboardEvent) {
    console.log('keydown');

    // For ignoring all keydown events that are part of IMO composition
    if (event.isComposing || event.key == 'Process') return;

    updateCaretPos();
    switch (event.key) {
        case 'Enter':
            onInputEnter(event);
            break;
        case 'ArrowDown':
            onInputArrowDown(event);
            break;
        case 'ArrowUp':
            onInputArrowUp(event);
            break;
    }
}

function updateCaretPos() {
    let curBlock = getCurInputBlock();

    // cyf: Continue here...

    // TODO: All methods for getting the position of the caret from the Internet
    // are not working. Just manually record the pos.

    // let caretPos = getCaretPos(curBlock);
    let caretPos = 0;
    let caretPosElem = document.getElementById('caret-position') as HTMLSpanElement;
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
    newBlock.addEventListener('keydown', onInputBlockKeyDown);
    return newBlock;
}

function onInputEnter(event: KeyboardEvent) {
    console.log('Enter pressed');
    let curBlock = event.target as HTMLDivElement;
    let newBlock = newInputBlock();
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

function initFirstBlock() {
    let firstBlock = newInputBlock();
    INPUT_CONTAINER.appendChild(firstBlock);
    firstBlock.focus();
}

initGlobals();
initListeners();
initFirstBlock();
