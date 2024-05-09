<script lang="ts" setup>

import { ref, onMounted } from 'vue'
import { debounce } from 'lodash'
import * as monaco from 'monaco-editor'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeDocument from 'rehype-document'

var renderDelay: number = 160;
var initContent: string = `请开始书写`

// Monaco works better with non-reactive variables
var content = initContent
var editor: monaco.editor.IStandaloneCodeEditor | null = null
// We use reactive variables for previewing
const renderedHtml = ref('')
const containerDiv = ref<HTMLDivElement | null>(null)
const editorDiv = ref<HTMLInputElement | null>(null)

function onContentChange() {
    console.debug('content changed')
    if (editor === null) {
        console.debug('curText is undefined')
        return
    } else {
        content = editor.getValue()
        // Handle caret position
        // console.log('caret position: ', editor.getPosition())
    }


    // Render
    debounceRender()
}

onMounted(() => {
    console.info('mounted')
    // // Set border between editor and preview
    // if (containerDiv.value === null) {
    //     console.log('container is undefined')
    //     return
    // } else {
    //     editorWidthProp.value = containerDiv.value.clientWidth / 2
    // }

    if (editorDiv.value === null) {
        console.log('editorDiv is null')
        return
    } else {
        console.info("Creating editor")
        editor = monaco.editor.create(editorDiv.value, {
            value: content,
            language: "markdown",
            automaticLayout: true,
            wordWrap: "on",
        })
        editor.onDidChangeModelContent(onContentChange)
        debounceRender()
    }
})

/**
 * Debounce to make sure fast consecutive only trigger one emit
 */
const debounceRender = debounce(async () => {
    await render()
}, renderDelay)

async function textToHtml(text: string): Promise<string> {
    const md = await unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkMath)
        .use(remarkRehype)
        .use(rehypeKatex)
        .use(rehypeDocument, {
            css: "../styles/katex.css"
        })
        .use(rehypeStringify)
        .process(text)
    return md.toString()
}

/**
 * Loop through each input block, calls its `render()`, 
 * concatenate the HTML result.
 */
async function render() {
    renderedHtml.value = await textToHtml(content)
    // console.log(renderedHtml.value)
}

/**
 * Get the current content of the editor
 */
function getAllContents(): string {
    if (editor === null) {
        console.debug('curText is undefined')
        throw new Error('editor is undefined')
    } else {
        content = editor.getValue()
    }
    return content
}

function setContent(content: string) {
    if (editor === null) {
        console.debug('curText is undefined')
        throw new Error('editor is undefined')
    } else {
        editor.setValue(content)
    }
}

defineExpose({
    getAllContents,
    setContent,
})

</script>

<template>
    <div id="container" ref="containerDiv">
        <link href="../styles/github-markdown.css" rel="stylesheet">
        <!-- <link href="../styles/katex.css" rel="stylesheet"> -->
        <!-- <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.0/dist/katex.min.css" integrity="sha384-Xi8rHCmBmhbuyyhbI88391ZKP2dmfnOl4rT9ZfRI7mLTdk1wblIUnrIq35nqwEvC" crossorigin="anonymous"></link> -->
        <div class="md-html-container" v-html="renderedHtml" contenteditable="true"></div>
    </div>
</template>

<style scoped>
#container {
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    border: 2px solid grey;
}

#editorContainer {
    /* position: absolute;
    top: 0px;
    left: 0px;
    height: 200px;
    width: 200px; */
    border: 1px solid green;
    background-color: red;
    width: 50%;
}

#resizer {
    background-color: aliceblue;
    cursor: w-resize;
    height: 100%;
    width: 4px;
}

#resizer:hover {
    background-color: blue;
}

#previewContainer {
    flex: 1 1 0%;
    overflow-y: scroll;
}


body {
    /* margin:0; */
    border: 10px solid #aaa;
}
</style>