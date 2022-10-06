<script lang="ts" setup>

import { ref, defineExpose, defineProps } from 'vue'

const emit = defineEmits<{
    (event: 'input-block-keyup', keyboardEvent: KeyboardEvent): void
}>()

const props = defineProps<{
    content: string
}>()

function onKeyup(event: KeyboardEvent): void {
    emit('input-block-keyup', event)
}

const block = ref(null)

function getContent(): String {
    let block = document.getElementById('block-container')
    let text = block?.innerText
    if (text) {
        return text
    }
    return '';
}
defineExpose({getContent})

</script>
<template>
    <div id="block-container" class="input-block" contenteditable="true" @keyup="onKeyup">
        <div>{{ content }}</div>
    </div>
</template>



<style scoped>
/* Input and render view */

[contenteditable] {
    /* display: inline; */
    white-space: nowrap;
    /* overflow: hidden; */
    text-overflow: inherit;
    -webkit-user-select: auto;
    user-select: auto;
    -moz-user-select: -moz-text;
    display: inline-block;
}

.input-block {
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
    box-shadow: rgba(100, 100, 111, 0.2) 0px 7px 29px 0px;
}

.input-block:focus {
    outline: none;
    box-shadow: rgba(100, 100, 111, 0.2) 0px 7px 29px 0px;
}

.input-block-math {
    border-left: 6px solid #00b4d8;
}

.input-block-math-error {
    border: 2px solid red;
}
</style>