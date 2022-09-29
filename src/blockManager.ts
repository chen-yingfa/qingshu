// import { InputBlock } from './inputBlock';
import type { Editor } from './editor';


/**
 * Manages all the input blocks in the editor.
 * 
 * This also manages all <div> of the input blocks.
 */
export class BlockManager {
    blocks: HTMLDivElement[] = [];
    blockContainer: HTMLDivElement;
    editor: Editor;

    constructor(editor: Editor, blockContainer: HTMLDivElement) {
        console.log('BlockManager constructor');
        this.blocks = [];
        this.editor = editor;
        this.blockContainer = blockContainer;
    }

    public initFirstBlock(): HTMLDivElement {
        let firstBlock = this.newBlock();
        this.blocks.push(firstBlock);
        this.blockContainer.appendChild(firstBlock);
        return firstBlock;
    }
    
    /**
     * Insert before the given block. `toInsert` will be placed at the position
     * of `child`'s current position, and child will be moved to the next position.
     * 
     * @param toInsert The block to insert.
     * @param child The block to insert before. If null, the block will be inserted
     * at the end of the block container.
     */
    insertBlockBefore(toInsert: HTMLDivElement, child: HTMLDivElement) {
        this.blockContainer.insertBefore(toInsert, child);
        if (child) {
            let index = this.blocks.indexOf(child);
            this.blocks.splice(index, 0, toInsert);
        } else {
            this.blocks.push(toInsert);
        }
    }
    
    insertBlockAfter(toInsert: HTMLDivElement, child: HTMLDivElement) {
        this.insertBlockBefore(toInsert, child.nextSibling as HTMLDivElement);
    }

    createBlockAfter(child: HTMLDivElement): HTMLDivElement {
        let newBlock = this.newBlock();
        this.insertBlockAfter(newBlock, child);
        return newBlock;
    }

    newBlock(): HTMLDivElement {
        let newInputDiv = document.createElement('div');
        newInputDiv.id = 'input-block';
        newInputDiv.contentEditable = 'true';
        newInputDiv.classList.add('input-block');

        /**
         * Pass all event listeners to the Editor class.
         * 
         * This is because we need to the events are triggers on the <div> 
         * elements of the input blocks, which are managed by the BlockManager 
         * class.
         */
        newInputDiv.onkeydown = this.editor.onInputBlockKeydown.bind(this.editor);
        newInputDiv.onkeyup = this.editor.onInputBlockKeyup.bind(this.editor);
        newInputDiv.onpaste = this.editor.onPaste.bind(this.editor);
        newInputDiv.onfocus = this.editor.onFocusBlock.bind(this.editor);
        return newInputDiv;
    }
}
