<script lang="ts">
import { BlockList } from 'net'
import InputBlock from './InputBlock.vue'


export interface MetaInputBlock {
    uid: number,
    type: string,
    initContent: string,
    inputBlock?: InstanceType<typeof InputBlock>,
}


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
                    uid: 0,
                    type: 'text',
                    initContent: 'block 0',
                    inputBlock: undefined,
                },
                {
                    uid: 1,
                    type: 'text',
                    initContent: 'block 1',
                    inputBlock: undefined,
                },
                {
                    uid: 2,
                    type: 'text',
                    initContent: 'block 2',
                    inputBlock: undefined,
                }] as MetaInputBlock[],
            renderedMd: '<p>This is a placeholder.</p>',
        }
    },
    mounted() {
        console.debug('Editor mounted')
        this.renderAll()
    },
    updated() {
        // console.log(this._getInputBlocks().map(b => b.content))
        // this.renderAll()
    },
    methods: {
        renderAll(): void {
            /**
             * Loop through each input block, calls its `render()`, 
             * concatenate the HTML result.
             */
            console.debug('renderAll')
            let inputBlocks = this.getInputBlocksSorted()
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
            this.renderAll()
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
            let newIndex = this.getBlockIndex(block) + 1
            this._insertNewBlockBefore(newIndex, initContent)
            /**
             * The content of the new block can only be modified after the DOM
             * is updated. So we need to wait for the next tick.
             */
            this.$nextTick(() => {
                let inputBlocks = this.getInputBlocksSorted()
                let newBlock = inputBlocks[newIndex]
                newBlock.focus()
                // this.renderAll()
            })
        },
        onGotoNextBlock(block: typeof InputBlock): void {
            console.log('onGotoNextBlock', block)
            let blockIdx = this.getBlockIndex(block)
            console.debug('cur index', blockIdx)
            console.debug(blockIdx)
            let inputBlocks = this.getInputBlocksSorted()
            if (blockIdx < inputBlocks.length - 1) {
                inputBlocks[blockIdx + 1].focus()
                inputBlocks[blockIdx + 1].moveCaretToStart()
            }
        },
        onGotoPrevBlock(block: typeof InputBlock): void {
            console.log('onGotoPrevBlock', block.uid)
            let blockIdx = this.getBlockIndex(block)
            // let inputBlocks = this._getInputBlocks()
            let inputBlocks = this.getInputBlocksSorted()
            if (blockIdx > 0) {
                inputBlocks[blockIdx - 1].focus()
                inputBlocks[blockIdx - 1].moveCaretToEnd()
            }
        },
        onDeleteBlock(block: typeof InputBlock): void {
            let prevIndex = block.index - 1
            if (prevIndex >= 0) {
                this._removeBlockByIndex(block.index)
                let inputBlocks = this.getInputBlocksSorted()
                inputBlocks[prevIndex].moveCaretToEnd()
            }
        },
        onConcatWithPrevBlock(block: typeof InputBlock): void {
            console.log('onConcatWithPrevBlock', block)
            let blockIdx = this.getBlockIndex(block)
            if (blockIdx > 0) {
                let inputBlocks = this.getInputBlocksSorted()
                let prevBlock = inputBlocks[blockIdx - 1]
                let prevContent = prevBlock.getContent()
                let content = block.getContent()
                prevBlock.setContent(prevContent + content)
                console.log('setting content', prevContent + content)
                this._removeBlockByIndex(blockIdx)
                this.$nextTick(() => {
                    prevBlock.setCaretPos(prevContent.length)
                })
            }
        },
        /**
         * Remove block by block index
         */
        _removeBlockByIndex(index: number): void {
            this.blocks.splice(index, 1)
        },
        /**
         * Remove block by UID
         */
        _removeBlockByUid(uid: number): void {
            let block = this._getInputBlockByUid(uid)
            let index = this.getBlockIndex(block)
            this._removeBlockByIndex(index)
        },
        _insertNewBlockBefore(blockIdx: number, initContent: string): void {
            // console.debug('_insertNewBlockBefore', blockIdx)
            // console.debug(initContent)
            this.blocks.splice(
                blockIdx,
                0,
                { 
                    // index: blockIdx,
                    type: 'text',
                    initContent: initContent,
                    uid: this.blocks.length,
                },
            )
        },
        /**
         * Get InputBlock's, sorted by block ID.
         */
        _getInputBlocks(): (typeof InputBlock)[] {
            return this.$refs.inputBlocks as (typeof InputBlock)[]
        },
        /**
         * Alias for `_getInputBlock()[blockUid]`
         */
        _getInputBlockByUid(uid: number): typeof InputBlock {
            return this._getInputBlocks()[uid]
        },

        /**
         * Get input blocks sorted by their actual position in the DOM, which
         * is given by `this.blocks`.
         * 
         * By default, Vue's `$ref` array is sorted by the :key attribute,
         * which is set to be block UID, so we just sort them according to 
         * to `uid` property of the elements of `this.blocks`.
         */
        getInputBlocksSorted(): (typeof InputBlock)[] {
            let refInputBlocks = this._getInputBlocks()  // Sorted by block UID
            let numBlocks = this.blocks.length
            let blockUids = this.blocks.map(b => b.uid)
            let sorted = Array<typeof InputBlock>(numBlocks)
            for (let i = 0; i < numBlocks; ++i) {
                let uid = blockUids[i]
                sorted[i] = refInputBlocks[uid];
            }
            return sorted
        },

        /**
         * Get the index of a given InputBlock in the DOM.
         * Return -1 if `block` is not found.
         */
        getBlockIndex(block: typeof InputBlock): number {
            // return block.index
            // TODO: Change this to a hash map for speed.
            return this.blocks.findIndex(b => b.uid === block.uid)
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
                :key=block.uid
                :type=block.type
                :uid=block.uid
                :index=index
                :initContent=block.initContent
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