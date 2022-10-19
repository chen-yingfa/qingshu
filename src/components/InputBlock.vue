<script lang="ts">

import { debounce } from 'lodash'

import { CaretUtils } from '../assets/js/caretPos'
import { curCaretPos } from '../assets/js/store'
import { marked } from 'marked'
import { strEnclose, isInputChar, strInsert, strRemoveChar, strSlice } from '../assets/js/utils'

import { keybindings } from '../assets/js/keybindings'

export default {
    name: 'InputBlock',
    props: {
        index: {
            type: Number,
            required: true
        },
        uid: {
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
            isFocused: false,
            content: "",
            caretPosition: 0,  // Index of character. Only used when this block is in focus
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
        console.debug('InputBlock mounted', this.uid)
    },
    // updated() {
    //     console.debug('InputBlock updated', this)
    //     this.setCaretPos(this.caretPosition)
    // },
    methods: {
        onKeyup(event: KeyboardEvent): void {
            // this.updateCaretPos()
        },
        onKeydown(event: KeyboardEvent): void {
            // For ignoring all keydown events that are part of IME composition
            if (event.isComposing || event.key == 'Process') return;

            console.log(event)

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
                    this._onBackspace(event)
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
                        event.preventDefault()
                        event.stopPropagation()
                        this.insertContent(event.key)
                    }
                    break
            }

        },
        onCompositionEnd(event: CompositionEvent): void {
            // For ignoring all keydown events that are part of IME composition
            console.log(event)
            this.insertContent(event.data)
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
        _onBackspace(event: KeyboardEvent): void {
            if (this.isCaretAtStart()) {
                event.preventDefault()
                // At the beginning of block, concatenate with prev block
                this.$emit('concat-with-prev-block', this)
            } else {
                /**
                 * Should this be handled automatically by contenteditable?
                 * Intercept and manually edit content prop and caret pos.
                 */
                event.preventDefault()
                console.debug('handling backspace')
                console.debug(this.content)
                let caretPos = this.getCaretPos()
                this.removeContentSubstr(caretPos - 1, caretPos)
                this.debounceRender()
            }
        },

        /**
         * Insert str into content at index
         * 
         * This will automatically handle the caret position after insertion.
         */
        insertContent(str: string, index: number | null = null): void {
            let caretPos = this.getCaretPos()
            if (!index) {
                index = caretPos
            }
            let oldContent = this.getContent()
            let newContent = strInsert(oldContent, str, index)
            this.setContent(newContent)

            console.debug('insertContent')
            console.debug('oldContent', oldContent)
            console.debug('newContent', newContent)

            if (caretPos < index) {
                this.setCaretPosAfterUpdate(caretPos)
            }
            else {
                this.setCaretPosAfterUpdate(caretPos + str.length)
            }
            this.debounceRender()
        },
        
        /**
         * Debounce to make sure fast consecutive only trigger one emit
         */
        debounceRender() {
            debounce(() => {
                this.$emit('content-update', this)
            }, 100)()
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

        getContent(): string { return this.content },

        /**
         * This will destroy caret and range selection.
         */
        setContent(str: string): void { this.content = str },

        /**
         * Remove a substring [start, end) from the content, this will 
         * automatically handle the caret position after modification.
         * 
         * @param start The starting index of the substring to remove (inclusive)
         * @param end The ending index of the substring to remove (exclusive)
         */
        removeContentSubstr(start: number, end: number): void {
            let strBefore = strSlice(
                this.getContent(), 0, start)
            let strAfter = strSlice(
                this.getContent(), end, this.getContent().length)
            let caretPos = this.getCaretPos()
            let finalCaretPos = null
            this.setContent(strBefore + strAfter)
            if (caretPos <= start) {
                // Caret is before the removed substring
                finalCaretPos = caretPos
            } else if (caretPos <= end) {
                // Caret is between in [start, end]
                finalCaretPos = start
            } else {
                finalCaretPos = caretPos - (end - start)
            }
            this.setCaretPosAfterUpdate(finalCaretPos)
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
            CaretUtils.setCaretPos(div, pos)
            this.caretPosition = pos
            this.updateCaretPos()
        },

        setCaretPosAfterUpdate(pos: number): void {
            this.$nextTick(() => {
                this.setCaretPos(pos)
            })
        },

        /**
         * Update caret pos (global state)
         */
        updateCaretPos(): void {
            let caretCol = this.getCaretPos()
            curCaretPos.col = caretCol
            curCaretPos.row = this.uid
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
        /**
         * Get the content-container Div element.
         */
        getContentContainer(): HTMLDivElement {
            return this.$refs.contentContainer as HTMLDivElement
        },
    }
}

</script>
<template>
    <div id="input-block-container" ref="container">
        <div class="block-index-container">
            {{ index }}
        </div>
        <div ref="contentContainer" class="input-block" contenteditable="true" 
            @keydown="onKeydown" @keyup="onKeyup" @compositionend="onCompositionEnd">
            {{ content }}
        </div>
        <div class="block-uid-container">
            {{ uid }}
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

.block-index-container {
    position: relative;
    bottom: 0px;
    right: 0px;
    font-size: 12px;
    color: #888888;
    padding-right: 5px;
    z-index: 1;
}

.block-uid-container {
    font-weight: 600;
    position: relative;
    bottom: 0px;
    left: 0px;
    font-size: 12px;
    color: #888888;
    padding-left: 5px;
    z-index: 1;
}
</style>
