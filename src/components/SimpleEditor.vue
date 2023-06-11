<script lang="ts" setup>

import { ref, onMounted } from 'vue'
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

> 这是一个注释

《桃花庵歌》

桃花坞里桃花庵，桃花庵里桃花仙。

桃花仙人种桃树，又折花枝当酒钱。

## Markdown 测试

There are 3 types of [Transformers](example.com) architecture.

- Encoder-decoder:
    - Original transformers[^1], the input is fed to a stack of encoders, which outputs a hidden state of shape (n, d).
    - The decoder produces the output sequence autoregressively[^2] while attending to the encoder's hidden states with cross-attention.
- Encoder-only
- Decoder-only

Let $\\text{Encoder}(\\cdot;\\theta)$ denote the encoder function parameterized by $\\theta$, then we have:

$$
h = \\text{Encoder}(x;\\theta)
$$

where $x$ is the input sequence and $h$ is the hidden state.

[^1]: Test.
[^2]: Autoregressive means that the output of the model is fed to itself as the input to produce the next token.

## 代码测试 Code Test

二分搜索的 Python 实现，放在了 \`bin_search.py\` 里面：

\`\`\`python
def bin_search(vec: list, target) -> int:
    '''
    Return the first first index such that when \`target\` is inserted
    into \`vec\`.
    '''
    lo, hi = 0, len(vec)
    while lo < hi:
        mid = (lo + hi) // 2
        if vec[mid] < target:
            lo = mid + 1
        else:
            hi = mid
    return lo
\`\`\`
`

// Monaco works better with non-reactive variables
var content = initContent
var editor: monaco.editor.IStandaloneCodeEditor | null = null
// We use reactive variables for previewing
const renderedHtml = ref('')
const containerDiv = ref<HTMLDivElement | null>(null)
const editorDiv = ref<HTMLInputElement | null>(null)
const resizerDiv = ref<HTMLInputElement | null>(null)
// Width in % instead of px to work with resizable window.
const editorWidthProp = ref(50)

// Variables for resizing
var isResizing = false
var downX = 0
var downY = 0
var editorWidthOnDown = 0

function onMouseMove(event: MouseEvent) {
    if (!isResizing) {
        return
    }

    const dx = event.clientX - downX;
    const dy = event.clientY - downY;

    if (editorDiv.value === null || containerDiv.value === null) {
        console.log('container is undefined')
        return
    } else {
        const newX = editorWidthOnDown + dx
        const containerWidth = containerDiv.value.clientWidth
        editorWidthProp.value = 100 * newX / containerWidth
        console.log(editorWidthProp.value)

        if (resizerDiv.value === null) {
            console.log('resizer is undefined')
            return
        } else {
            document.body.style.cursor = 'w-resize'
        }
    }
}

function onMouseUp(event: MouseEvent) {
    console.log('mouse up, stop dragging')
    isResizing = false
    document.body.style.cursor = 'default'
}

function onMouseDownResizer(e: MouseEvent) {
    console.log('mouse down, start dragging')
    e.preventDefault();
    if (containerDiv.value !== null && editorDiv.value !== null) {
        // Get the current mouse position
        downX = e.clientX
        downY = e.clientY
        isResizing = true
        editorWidthOnDown = editorDiv.value.clientWidth
        
        // Attach the listeners to `document`
        document.addEventListener('mousemove', onMouseMove)
    }
}

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
function getAllContents() {
    if (editor === null) {
        console.debug('curText is undefined')
        return
    } else {
        content = editor.getValue()
    }
}

</script>

<template>
    <div id="container" ref="containerDiv" @mousemove="onMouseMove" @mouseup="onMouseUp">
        <div id="editorContainer" ref="editorDiv" :style="{ width: editorWidthProp + '%' }">
        </div>
        <div id="resizer" ref="resizerDiv" @mousedown="onMouseDownResizer"></div>
        <div id="previewContainer" ref="previewDiv">
            <link href="../styles/github-markdown.css" rel="stylesheet">
            <!-- <link href="../styles/katex.css" rel="stylesheet"> -->
            <!-- <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.0/dist/katex.min.css" integrity="sha384-Xi8rHCmBmhbuyyhbI88391ZKP2dmfnOl4rT9ZfRI7mLTdk1wblIUnrIq35nqwEvC" crossorigin="anonymous"></link> -->
            <div class="md-html-container" v-html="renderedHtml"></div>
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

#editorContainer {
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