<script lang="ts">

import { CaretPos } from '../assets/js/caretPos'
import { curCaretPos } from '../assets/js/store'
import { marked } from 'marked'
import { isAlpha, strInsert } from '../assets/js/utils'

import { keybindings } from '../assets/js/keybindings'

export default {
    name: 'InputBlock',
    props: {
        blockId: {
            type: Number,
            required: true,
        },
        initialContent: {
            type: String,
            default: ''
        }
    },
    data() {
        return {
            content: this.initialContent,
        }
    },
    emits: [
        'input-block-keydown',
        'input-block-keyup',
        'content-update',
        'insert-block',
        'delete-block',
    ],
    methods: {
        onKeyup(event: KeyboardEvent): void {
            // console.log('onKeyup', event)
            let div = event.target as HTMLDivElement

            // Update caret position
            let caretPos = this.getCaretPos()
            curCaretPos.col = caretPos.col
            curCaretPos.row = caretPos.row

            // Emit event to Editor
            // this.$emit('input-block-keyup', this.blockId, event)
        },
        onKeydown(event: KeyboardEvent): void {
            // For ignoring all keydown events that are part of IMO composition
            if (event.isComposing || event.key == 'Process') return;

            // Intercept the key, and update the text content manually
            event.preventDefault()
            event.stopPropagation()
            // console.log("onKeydown", event)

            /**
             * Handle keybindings
             */
            if (event.ctrlKey) {
                let keyName = 'ctrl'
                if (event.shiftKey) {
                    keyName += '+shift'
                }
                keyName += '+' + event.key.toUpperCase()
                if (keyName in keybindings) {
                    let action: string = keybindings[keyName] + '()'
                    console.log('evaluating:', action)
                    eval(action)
                }

                return
            }

            switch (event.key) {
                case 'Enter':
                    // Prevent the default behavior of inserting a new line
                    event.preventDefault()
                    // Insert a new block
                    this.$emit('insert-block', this.blockId)
                    break
                case 'Backspace':
                    // Prevent the default behavior of deleting a new line
                    event.preventDefault()
                    // Delete the current block
                    this.$emit('delete-block', this.blockId)
                    break
                default:
                    // Update the text content
                    if (isAlpha(event.key)) {
                        this.insertContent(event.key)
                    }
                    this.$emit('content-update', this.blockId, this.content)
                    break
            }

        },

        getContent(): string { return this.content },

        /**
         * Insert string into this block.
         */
        insertContent(str: string) {
            console.log('inserting content', str)
            let caretPos = this.getCaretPos()
            this.content = strInsert(this.content, str, caretPos.col)
        },

        /**
         * Render the text content of this block to HTML.
         * 
         * Return: string of the rendered HTML.
         */
        render(): string {
            let htmlResult = ''
            let md = this.getContent()
            if (md) {
                htmlResult = marked(md)
            }
            return htmlResult
        },

        /**
         * Get the content-container Div element.
         */
        getContentContainer(): HTMLDivElement {
            return this.$refs.contentContainer as HTMLDivElement
        },

        /**
         * Get the caret position of the given element.
         * 
         * @param el The element to get caret position from.
         * @returns The caret position.
         */
        getCaretPos(): CaretPos {
            let el = this.getContentContainer()
            let col = -1
            let row = -1
            let sel = window.getSelection()
            if (sel?.rangeCount) {
                let range = sel.getRangeAt(0)
                // Get line number within the block
                row = this.blockId
                col = range.endOffset
            }
            return {
                col: col,
                row: row,
            }
        },
    }
}

</script>
<template>
    <div id="input-block-container">
        <div ref="contentContainer" class="input-block" contenteditable="true" @keydown="onKeydown" @keyup="onKeyup">
            {{ content }}
        </div>
        <div class="block-id">
            {{ blockId }}
        </div>
    </div>
</template>
    


<style scoped>
/* Input and render view */

[contenteditable] {
    /* display: inline; */
    /* white-space: nowrap; */
    /* overflow: hidden; */
    text-overflow: inherit;
    -webkit-user-select: auto;
    user-select: auto;
    -moz-user-select: -moz-text;
    display: inline-block;
    white-space: pre-wrap;
    word-break: break-word;
}

#input-block-container {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
}

.input-block {
    flex-grow: 1;
    margin: 0;
    padding: 4px;
    border: 2px solid rgba(0, 0, 0, 0);
    border-radius: 4px;
    white-space: pre-wrap;
    word-wrap: break-word;
    background-color: white;
    /*make the text center vertically */
    min-height: 28px;
    /* height: 28px; */
    line-height: 20px;
}

.input-block:hover {
    box-shadow: rgba(100, 100, 111, 0.4) 0px 7px 29px 0px;
}

.input-block:focus {
    outline: none;
    box-shadow: rgba(100, 100, 111, 0.4) 0px 7px 29px 0px;
}

.input-block-math {
    border-left: 6px solid #00b4d8;
}

.input-block-math-error {
    border: 2px solid red;
}

.block-id {
    position: relative;
    bottom: 0px;
    right: 0px;
    font-size: 12px;
    color: #888888;
    padding: 2px;
    z-index: 1;
}
</style>
