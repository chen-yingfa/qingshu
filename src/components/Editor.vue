<script lang="ts">
import InputBlock from './InputBlock.vue'

export default {
    name: 'Editor',
    components: {
        InputBlock
    },
    data() {
        return {
            /**
             * @note - Block ID and block index is different!
             */
            blocks: [
                {
                    type: 'text',
                    initContent: 'block 0'
                },
                {
                    type: 'text',
                    initContent: 'block 1'
                },
                {
                    type: 'text',
                    initContent: 'block 2'
                }
            ],
            renderedMd: '<p>This is a placeholder.</p>',
        }
    },
    mounted() {
        console.debug('Editor mounted')
        this.renderAll()
    },
    beforeUpdate() {
        
    },
    updated() {
        console.log(this._getInputBlocks().map(b => b.content))
    },
    methods: {
        renderAll(): void {
            /**
             * Loop through each input block, calls its `render()`, 
             * concatenate the HTML result.
             */
            console.debug('renderAll')
            let inputBlocks = this._getInputBlocks()
            console.log(inputBlocks)
            let numBlocks = inputBlocks.length
            this.renderedMd = ''
            for (let i = 0; i < numBlocks; ++i) {
                let block = inputBlocks[i] as unknown as { render(): string }
                this.renderedMd += block.render()
            }
            console.log(this.blocks)
        },
        onContentUpdate(block: typeof InputBlock): void {
            //this.renderAll()
        },

        /**
         * Insert a new input block with given start content after the given 
         * block, and
         * 
         * @param block The block after which the new block should 
         * be inserted.
         * @param initContent The initial content of the new block.
         */
        newBlockAfter(block: typeof InputBlock, initContent: string): void {
            console.log('newBlockAfter', block, initContent)
            let newIndex = block.id + 1
            this._insertNewBlockBefore(newIndex, initContent)
            /**
             * The content of the new block can only be modified after the DOM
             * is updated. So we need to wait for the next tick.
             */
            // this.$nextTick(() => {
            //     let inputBlocks = this._getInputBlocks()
            //     let newBlock = inputBlocks[newIndex]
            //     newBlock.focus()
            //     // this.renderAll()
            // })
        },
        onGotoNextBlock(block: typeof InputBlock): void {
            // console.log('onGotoNextBlock', block)
            // let blockIdx = this.getBlockIndex(block)
            // let inputBlocks = this._getInputBlocks()
            // if (blockIdx < inputBlocks.length - 1) {
            //     inputBlocks[blockIdx + 1].focus()
            //     inputBlocks[blockIdx + 1].moveCaretToStart()
            // }
        },
        onGotoPrevBlock(block: typeof InputBlock): void {
            let blockIdx = this.getBlockIndex(block)
            let inputBlocks = this._getInputBlocks()
            if (blockIdx > 0) {
                inputBlocks[blockIdx - 1].focus()
                inputBlocks[blockIdx - 1].moveCaretToEnd()
            }
        },
        onDeleteBlock(block: typeof InputBlock): void {
            this._removeBlock(block.id)
        },
        onConcatWithPrevBlock(block: typeof InputBlock): void {
            console.log('onConcatWithPrevBlock', block)
            let blockId = block.id
            if (blockId > 0) {
                let inputBlocks = this._getInputBlocks()
                let prevBlock = inputBlocks[blockId - 1]
                let prevContent = prevBlock.getContent()
                let content = block.getContent()
                prevBlock.setContent(prevContent + content)
                this._removeBlock(blockId)
                for (let i = blockId; i < inputBlocks.length; ++i) {
                    inputBlocks[i].setBlockId(i - 1)
                }
                prevBlock.setCaretPos(prevContent.length)
            }
        },
        _removeBlock(blockId: number): void {
            // this.blocks.splice(blockId, 1)
            // // Change all subsequent block ID
            // for (let i = blockId; i < this.blocks.length; ++i) {
            //     this.blocks[i].index = i
            // }
        },
        _insertNewBlockBefore(blockIdx: number, initContent: string): void {
            console.debug('_insertNewBlockBefore', blockIdx, initContent)
            
            this.blocks.splice(
                blockIdx,
                0,
                { 
                    // index: blockIdx,
                    type: 'text',
                    initContent: initContent,
                },
            )
            
            // // Change all subsequent block indexes
            // for (let i = blockIdx; i < this.blocks.length; ++i) {
            //     this.blocks[i].index = i
            // }
        },
        /**
         * Get InputBlock's, sorted by block ID.
         */
        _getInputBlocks(): (typeof InputBlock)[] {
            return this.$refs.inputBlocks as (typeof InputBlock)[]
        },
        /**
         * Alias for `_getInputBlock()[blockId]`
         */
        _getInputBlock(blockId: number): typeof InputBlock {
            return this._getInputBlocks()[blockId]
        },

        // /**
        //  * Get input blocks sorted by their actual position in the DOM, which
        //  * is given by `this.blocks`.
        //  * 
        //  * By default, Vue's `$ref` array is sorted by the :key attribute,
        //  * which is set to be block ID, so we just sort them according to 
        //  * `this.blocks`.
        //  */
        // getInputBlocksSorted(): (typeof InputBlock)[] {
        //     let inputBlocks = this._getInputBlocks()
        //     let sorted = Array<typeof InputBlock>(inputBlocks.length)
        //     for (let i = 0; i < inputBlocks.length; ++i) {
        //         let curBlockId = this.blocks[i].id
        //         sorted[i] = inputBlocks[curBlockId]
        //     }
        //     return sorted
        // },

        /**
         * Get the index of a given InputBlock in the DOM.
         * Return -1 if `block` is not found.
         */
        getBlockIndex(block: typeof InputBlock): number {
            return block.id
        },

        /**
         * The order of the blocks are given by the `blocks` array.
         * 
         * But, getting blocks from Vue's $ref is not sorted by 
         * their order in the DOM tree, but sorted by the :key attribute,
         * which is set to be block ID.
         * 
         * So to get the next block, we have to first find the corresponding
         * element in the `blocks` array using block ID, and then get the next 
         * element, then use its block ID to get the corresponding block.
         * 
         * @param block The block whose next block is to be returned.
         * @returns The next block. `null` if `block` is the last block.
         */
        getNextBlock(block: typeof InputBlock): typeof InputBlock | null {
            let inputBlocks = this._getInputBlocks()
            let curId = block.id
            let curBlockIndex = block.id
            let nextBlockIndex = curBlockIndex + 1
            let nextBlockId = nextBlockIndex
            if (nextBlockId < this.blocks.length) {
                return inputBlocks[nextBlockId]
            } else {
                return null
            }
        }
    },
}

</script>
    
<template>
    <div id="editor-container">
        <div id="input-container">
            <!-- 
                Manipulation of input block divs should be done manually.
                Not using v-for in order to avoid rerendering of all blocks.
            -->
            <InputBlock v-for="(block, index) of blocks" 
                ref="inputBlocks" 
                :key="block.id"
                :type="block.type"
                :id="index"
                :initContent="block.initContent"
                @content-update="onContentUpdate" 
                @goto-next-block="onGotoNextBlock" 
                @goto-prev-block="onGotoPrevBlock"
                @new-block-after="newBlockAfter" 
                @delete-block="onDeleteBlock"
                @concat-with-prev-block="onConcatWithPrevBlock" />
        </div>
        <div id="preview-container">
            <link href="../styles/github.css" rel="stylesheet">
            <!-- The HTML content be generated by the Markdown renderer -->
            <div id="md-container" class="markdown-body" v-html="renderedMd">
            </div>
        </div>
    </div>
</template>
                    
<style scope>
/* This should be moved to parent component */
#editor-container {
    display: flex;
    flex-direction: row;
    height: calc(100% - 20px - 26px);
}

#input-container {
    font-family: 'Ubuntu Mono', 'Consolas', 'Courier New', Courier, monospace;
    font-size: 14px;
    width: 50%;
    height: auto;
    padding: 8px;
    margin: 0;
    overflow: auto;
    background-color: #eeeeee;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    gap: 4px;
    /* white-space: pre-wrap; */

    /* Scrollbar */
    scrollbar-width: thin;
    scrollbar-color: rgba(99, 99, 99, 0.2) rgba(99, 99, 99, 0.2);
}

#preview-container {
    padding: 8px;
    width: 50%;
    margin: 0;
    border-left: rgba(99, 99, 99, 0.2) 1px solid;
    /* background-color: bisque; */
    overflow: auto;
    font-size: 14px;

    /* Scrollbar */
    scrollbar-width: thin;
    scrollbar-color: rgba(99, 99, 99, 0.2) rgba(99, 99, 99, 0.2);
}
</style>