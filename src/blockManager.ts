// import { InputBlock } from './inputBlock';
import type { Editor } from './editor';


/**
 * Manages all the input blocks in the editor.
 * 
 * This also manages all <div> of the input blocks.
 */
export class BlockManager {
    // blocks: HTMLDivElement[] = [];
    blockContainer: HTMLDivElement;
    editor: Editor;

    constructor(editor: Editor, blockContainer: HTMLDivElement) {
        console.log('BlockManager constructor');
        // this.blocks = [];
        this.editor = editor;
        this.blockContainer = blockContainer;
    }

    public initFirstBlock(): HTMLDivElement {
        let firstBlock = this.newBlock();
        // this.blocks.push(firstBlock);
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
        // if (child) {
        //     let index = this.blocks.indexOf(child);
        //     this.blocks.splice(index, 0, toInsert);
        // } else {
        //     this.blocks.push(toInsert);
        // }
    }
    
    insertBlockAfter(toInsert: HTMLDivElement, child: HTMLDivElement) {
        this.insertBlockBefore(toInsert, child.nextSibling as HTMLDivElement);
    }

    /**
     *  
     */
    removeBlock(block: HTMLDivElement) {
        this.blockContainer.removeChild(block);
    }

    createBlockAfter(child: HTMLDivElement): HTMLDivElement {
        let newBlock = this.newBlock();
        this.insertBlockAfter(newBlock, child);
        return newBlock;
    }

    newBlock(): HTMLDivElement {
        let div = document.createElement('div');
        div.id = 'input-block';
        div.contentEditable = 'true';
        div.classList.add('input-block');

        /**
         * Pass all event listeners to the Editor class.
         * 
         * This is because we need to the events are triggers on the <div> 
         * elements of the input blocks, which are managed by the BlockManager 
         * class.
         */
        div.onkeydown = this.editor.onInputBlockKeydown.bind(this.editor);
        div.onkeyup = this.editor.onInputBlockKeyup.bind(this.editor);
        div.onpaste = this.editor.onPaste.bind(this.editor);
        div.onfocus = this.editor.onFocusBlock.bind(this.editor);
        div.onclick = this.editor.onClickInputBlock.bind(this.editor);
        return div;
    }

    /**
     * Get the first block in the block container.
     */
    getFirstBlock(): HTMLDivElement {
        return this.blockContainer.firstChild as HTMLDivElement;
    }

    /**
     * Get the last block in the block container.
     */
    getLastBlock(): HTMLDivElement {
        return this.blockContainer.lastChild as HTMLDivElement;
    }

    /**
     * Get number of blocks in the block container.
     */
    getBlockCount(): number {
        return this.blockContainer.childElementCount;
    }

    getBlock(index: number): HTMLDivElement {
        return this.blockContainer.children[index] as HTMLDivElement;
    }

    /**
     * Get the block that is currently focused, or null if no block is focused.
     */
    getFocusedBlock(): HTMLDivElement {
        let activeElement = document.activeElement as HTMLDivElement;
        if (activeElement && activeElement.classList.contains('input-block')) {
            return activeElement;
        } else {
            return null;
        }
    }

    getIndexOfBlock(block: HTMLDivElement): number {
        return Array.from(this.blockContainer.children).indexOf(block);
    }
}
