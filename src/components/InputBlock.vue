<script lang="ts">

import { debounce } from 'lodash'

import { CaretUtils } from '../assets/js/caretPos'
import { curCaretPos } from '../assets/js/store'
import { marked } from 'marked'
import { strEnclose, isInputChar, strInsert, strRemoveChar } from '../assets/js/utils'

import { keybindings } from '../assets/js/keybindings'

export default {
    name: 'InputBlock',
    props: {
        id: {
            type: Number,
            required: true
        },
        type: {
            type: String,
            required: true
        },
        initContent: {
            type: String,
            default: ''
        },
    },
    data() {
        return {
            content: "",
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
        'concat-with-prev-block',
    ],
    mounted() {
        this.setContent(this.initContent)
        console.debug('InputBlock mounted', this)
    },
    update() {
        console.debug('InputBlock updated', this)
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
                    // let action: string = keybindings[keyName] + '()'
                    // console.log('evaluating:', action)
                    this.handleKeyboardShortcut(keyName)
                    event.preventDefault();
                }

                return
            }

            switch (event.key) {
                case 'Enter':
                    // Prevent the default behavior of inserting a new line
                    event.preventDefault()
                    event.stopPropagation()
                    this._onInputEnter(event)
                    break
                case 'Backspace':
                    // Prevent the default behavior of deleting a new line
                    const selection = window.getSelection() as Selection
                    // Don't allow deleting nodes
                    if (!selection.anchorNode?.isSameNode(selection.focusNode))
                        event.preventDefault()
                    this.onBackspace(event)
                    break
                case 'ArrowUp':
                    this.onInputArrowUp(event)
                    break
                case 'ArrowDown':
                    this.onInputArrowDown(event)
                    break
                case 'ArrowRight':
                    this.onInputArrowRight(event)
                    break
                case 'ArrowLeft':
                    this.onInputArrowLeft(event)
                    break
                default:
                    // Update the text content
                    if (isInputChar(event.key)) {
                        // event.preventDefault()
                        event.stopPropagation()
                        this.content = this.getContentContainer().innerHTML
                        // this.insertContent(event.key)
                    }
                    break
            }

        },

        handleKeyboardShortcut(hotkey: string): void {
            switch (hotkey) {
                case "ctrl+B":
                    this.insertEnclosingAtSelection("**", "**")
                    break
                case "ctrl+I":
                    this.insertEnclosingAtSelection("*", "*")
                    break
            }
        },
        _onInputEnter(event: KeyboardEvent): void {
            event.preventDefault()
            event.stopPropagation()
            let curText = this.getContent()
            let caretPos = this.getCaretPos()
            /**
             * Handle regular text.
             * Slice the current block into two blocks.
             */
            let textBefore = curText.slice(0, caretPos)
            let textAfter = curText.slice(caretPos, curText.length)
            this.setContent(textBefore)
            this.$emit('new-block-after', this, textAfter)
        },
        onBackspace(event: KeyboardEvent): void {
            // Delete if block is empty
            if (this.getContentLen() == 0) {
                event.preventDefault()
                this.$emit('delete-block', this)
            } else {
                if (this.isCaretAtStart()) {
                    event.preventDefault()
                    // At the beginning of block, concatenate with prev block
                    this.$emit('concat-with-prev-block', this)
                } else {
                    // This is handled automatically by contenteditable
                    // let caretPos = this.getCaretPos()
                    // this.setContent(
                    //     strRemoveChar(this.getContent(), caretPos - 1))
                }
            }
        },

        insertContent(str: string): void {
            let caretPos = this.getCaretPos()
            // let newContent = strInsert(this.getContent(), str, caretPos)
            // this.setContent(newContent)
            // this.setCaretPos(caretPos + str.length)
            // this.updateCaretPos()
            console.log('inserted', str)
            // Debounce to make sure fast consecutive only trigger one emit
            // debounce(() => {
            //     this.$emit('content-update', this, newContent)
            // }, 100)()
        },

        onInputArrowRight(event: KeyboardEvent): void {
            if (this.isCaretAtEnd()) {
                event.preventDefault()
                this.$emit('goto-next-block', this)
            }
        },
        onInputArrowLeft(event: KeyboardEvent): void {
            if (this.isCaretAtStart()) {
                event.preventDefault()
                this.$emit('goto-prev-block', this)
            }
        },
        onInputArrowUp(event: KeyboardEvent): void {
            if (this.isCaretAtStart()) {
                event.preventDefault()
                this.$emit('goto-prev-block', this)
            }
        },
        onInputArrowDown(event: KeyboardEvent): void {
            if (this.isCaretAtEnd()) {
                event.preventDefault()
                this.$emit('goto-next-block', this)
            }
        },

        getContent(): string {
            return this.content
            // return this.getContentContainer().textContent as string
        },
        /**
         * This will destroy caret and range selection.
         */
        setContent(str: string): void {
            this.content = str
            // this.getContentContainer().innerText = str
        },
        getContentLen(): number { return this.getContent().length },

        insertEnclosingAtSelection(startStr: string, endStr: string) {
            let selection = window.getSelection() as Selection
            let range = selection.getRangeAt(0)
            this.insertEnlosing(range, startStr, endStr)
        },

        /**
         * Insert enclosing to a range
         */
        insertEnlosing(range: Range, startStr: string, endStr: string) {
            console.debug("Inserting enclosing with \"" + startStr + "\" and \"" + endStr + "\"")
            const cc = this.getContentContainer()
            const clonedOffset = {
                start: range.startOffset,
                end: range.endOffset,
            }
            cc.innerHTML = strEnclose(cc.innerHTML, range, startStr, endStr)


            // After editting the innerHTML, we need to re-apply the selection
            if (cc.hasChildNodes()) {
                const newRange = document.createRange();
                const sel = window.getSelection() as Selection;
                newRange.setStart(cc.childNodes[0], clonedOffset.start)
                newRange.setEnd(cc.childNodes[0], clonedOffset.end + startStr.length + endStr.length)
                sel.removeAllRanges()
                sel.addRange(newRange)
            }

            this.$emit('content-update', this)
        },



        /**
         * Render the text content of this block to HTML.
         * 
         * @returns string of the rendered HTML.
         */
        render(): string {
            let md = this.getContent()
            if (md) {
                return marked(md)
            }
            return ''
        },

        /**
         * Get the content-container Div element.
         */
        getContentContainer(): HTMLDivElement {
            return this.$refs.contentContainer as HTMLDivElement
        },

        /**
         * Get current caret position.
         */
        getCaretPos(): number {
            let div = this.getContentContainer()
            return CaretUtils.getCaretPos(div)
        },

        /**
         * Set the caret position. This will focus the content container.
         * 
         * @param pos The caret position.
         */
        setCaretPos(pos: number): void {
            console.debug('setCaretPos', pos)
            let div = this.getContentContainer()
            div.focus()
            CaretUtils.setCaretPos(div, pos)
        },

        /**
         * Update caret pos (global state)
         */
        updateCaretPos(): void {
            let caretCol = this.getCaretPos()
            curCaretPos.col = caretCol
            curCaretPos.row = this.id
        },

        isCaretAtStart(): boolean { return this.getCaretPos() === 0 },

        isCaretAtEnd(): boolean {
            return this.getCaretPos() === this.getContent().length
        },

        focus(): void {
            this.getContentContainer().focus()
        },
        moveCaretToStart(): void {
            this.setCaretPos(0)
        },
        moveCaretToEnd(): void {
            this.setCaretPos(this.getContentLen())
        },
        /**
         * Get the container div of this entire block.
         */
        getContainer(): HTMLDivElement {
            return this.$refs.container as HTMLDivElement
        },
    }
}

</script>
<template>
    <div id="input-block-container" ref="container">
        <div class="block-id">
            {{ id }}
        </div>
        <div ref="contentContainer" class="input-block" contenteditable="true" @keydown="onKeydown" @keyup="onKeyup">
            {{content}}
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
    padding-right: 5px;
    z-index: 1;
}
</style>
