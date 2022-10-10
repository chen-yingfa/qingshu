<script lang="ts">

import { CaretPos, CaretUtils } from '../assets/js/caretPos'
import { curCaretPos } from '../assets/js/store'
import { marked } from 'marked'
import { isInputChar, strInsert, strRemoveChar } from '../assets/js/utils'

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
        'new-block-after',
        'delete-block',
        'goto-next-block',
        'goto-prev-block',
    ],
    mounted() {
        this.getContentContainer().textContent = this.content
    },
    methods: {
        onKeyup(event: KeyboardEvent): void {
            this.updateCaretPos()
        },
        onKeydown(event: KeyboardEvent): void {
            // For ignoring all keydown events that are part of IMO composition
            if (event.isComposing || event.key == 'Process') return;


            /**
             * Handle keybindings
             */
            if (event.ctrlKey) {
                // event.preventDefault()
                event.stopPropagation()
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
                    event.stopPropagation()
                    this.onInputEnter(event)
                    break
                case 'Backspace':
                    // Prevent the default behavior of deleting a new line
                    this.onBackspace(event)
                    break
                case 'ArrowRight':
                    this.onInputArrowRight(event);
                    break;
                default:
                    // Update the text content
                    event.preventDefault()
                    event.stopPropagation()
                    if (isInputChar(event.key)) {
                        this.insertContent(event.key)
                    }
                    break
            }

        },

        onInputEnter(event: KeyboardEvent) {
            event.preventDefault();
            event.stopPropagation();
            let curText = this.content;
            let caretPos = this.getCaretPos();
            /**
             * Handle regular text.
             * Slice the current block into two blocks.
             */
            let textBefore = curText.slice(0, caretPos);
            let textAfter = curText.slice(caretPos, curText.length);
            this.setContent(this, textBefore)

            this.$emit('new-block-after', textAfter)
        },


        onBackspace(event: KeyboardEvent): void {
            // Delete if block is empty
            if (this.content.length == 0) {
                this.$emit('delete-block', this.blockId)
            } else {
                let caretPos = this.getCaretPos()
                if (caretPos == 0) {
                    // At the beginning of block, concatenate with prev block
                } else {
                    this.content = strRemoveChar(this.content, caretPos - 1)
                }
            }
        },

        insertContent(str: string): void {
            let caretPos = this.getCaretPos()
            let newContent = strInsert(this.content, str, caretPos)
            this.setContent(newContent)
            this.setCaretPos(caretPos + str.length)
            this.updateCaretPos()
            this.$emit('content-update', this.blockId, this.content)
        },

        onInputArrowRight(event: KeyboardEvent) {
            if (this.isCaretAtEnd()) {
                this.$emit('goto-next-block')
            }
        },

        getContent(): string { return this.content },
        /**
         * This will destroy caret and range selection.
         */
        setContent(str: string): void {
            this.content = str
            this.getContentContainer().innerText = this.content
        },

        /**
         * Render the text content of this block to HTML.
         * 
         * @returns string of the rendered HTML.
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
        getCaretPos(): number {
            let div = this.getContentContainer()
            let col = CaretUtils.getCaretPos(div)
            return col
        },

        /**
         * Set the caret position of the given element.
         * 
         * @param el The element to set caret position to.
         * @param pos The caret position.
         */
        setCaretPos(pos: number): void {
            console.log('setting', pos)
            let div = this.getContentContainer()
            CaretUtils.setCaretPos(div, pos)
            div.focus()
        },

        /**
         * Update caret pos (global state)
         */
        updateCaretPos(): void {
            let caretCol = this.getCaretPos()
            curCaretPos.col = caretCol
            curCaretPos.row = this.blockId
        },

        isCaretAtStart(): boolean { return this.getCaretPos() === 0 },

        isCaretAtEnd(): boolean {
            return this.getCaretPos() === this.content.length
        }
    }
}

</script>
<template>
    <div id="input-block-container">
        <div ref="contentContainer" class="input-block" contenteditable="true" autocapitalize="off" autocomplete="off"
            @keydown="onKeydown" @keyup="onKeyup">
            <!-- Don't use Vue reactivity -->
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
    display: inline-block;
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
