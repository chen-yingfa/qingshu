<script lang="ts" setup>

import { ref, onMounted, toRaw } from 'vue'
import { debounce } from 'lodash'
import * as monaco from 'monaco-editor'
import { marked } from 'marked'
import { remark } from 'remark'
import {unified} from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeDocument from 'rehype-document'

var renderDelay: number = 160;
var initContent: string = `# 你好！

> 请书之
`

// Monaco works better with non-reactive variables
var content = initContent
var editor: monaco.editor.IStandaloneCodeEditor | null = null
// We use reactive variables for previewing
const renderedHtml = ref('')
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
    if (editorDiv.value === null) {
        console.log('editorDiv is null')
        return
    } else {
        console.info("Creating editor")
        editor = monaco.editor.create(editorDiv.value, {
            value: content,
            language: "markdown",
            automaticLayout: true,
            // wordWrap: "on",
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

async function render() {
    /**
     * Loop through each input block, calls its `render()`, 
     * concatenate the HTML result.
     */
    renderedHtml.value = await textToHtml(content)
    console.log(renderedHtml.value)
}

</script>

<template>
    <div id="container">
        <div id="editor" ref="editorDiv">
        </div>
        <div id="preview" ref="previewDiv">
            <link href="../styles/github.css" rel="stylesheet">
            <!-- <link href="../styles/katex.css" rel="stylesheet"> -->
            <!-- <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.0/dist/katex.min.css" integrity="sha384-Xi8rHCmBmhbuyyhbI88391ZKP2dmfnOl4rT9ZfRI7mLTdk1wblIUnrIq35nqwEvC" crossorigin="anonymous"></link> -->
            <div v-html="renderedHtml"></div>
        </div>
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

#editor {
    flex: 1;
}

#preview {
    padding: 4px;
    /* border: 4px solid grey; */
    box-shadow: 0 0 4px 4px grey;
    flex: 1;
}
</style>