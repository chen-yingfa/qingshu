<script setup lang="ts">
import Editor from './components/Editor.vue'
import SimpleEditor from './components/SimpleEditor.vue'
import TitleBar from './components/TitleBar.vue'
import StatusBar from './components/StatusBar.vue'

import type { Ref } from 'vue'
import { ref } from 'vue'

const { ipcRenderer } = require('electron')  // Somehow this can't be changed to import
const fs = require('fs')

let fileName = ref('Untitled-1')
let isSelectedFile = ref(false)
let editor: Ref<typeof SimpleEditor | null> = ref(null)


function readFile(path: string) {
    fs.readFile(path, 'utf-8', (err: any, content: string) => {
        if (err) {
            console.error(err)
            return
        }
        fileName.value = path
        // Replace the content of the editor
        if (editor.value === null) {
            console.error('editor is undefined')
        } else {
            editor.value.setContent(content)
        }
    })
}

function openFile() {
    ipcRenderer.invoke('open-file')
        .then((paths: string[]) => {
            console.log('got files:', paths)
            if (paths.length > 0) {
                const path = paths[0]
                readFile(path)
            }
        })
}

function saveFile() {
    if (isSelectedFile) {
        saveToFile(fileName.value)
    } else {
        saveAs()
    }
    return
}

function saveAs() {
    ipcRenderer.invoke('save-file')
        .then((path: string) => {
            console.log('got path:', path)
            if (path.length > 0) {
                saveToFile(path)
            }
        })
}

function dump(content: string, path: string) {
    fs.writeFileSync(path, content, (err: any) => {
        if (err) {
            warn(err)
            return
        }
        console.log('file saved')
        fileName.value = path
        isSelectedFile.value = true
    })
}

function saveToFile(path: string): void {
    console.log('saving to file:', path)
    if (editor.value === null) {
        console.error('editor is undefined')
    } else {
        try {
            const content: string = editor.value.getAllContents()
            console.info('content', content)
            dump(content, path)
            fileName.value = path
        } catch (e: any) {
            warn(e)
        }
    }
}

function warn(err: any) {
    console.warn('warn', err)
}

</script>
    
<template>
    <link href="../../styles/main.css" rel="stylesheet">
    <div id="root-container">
        <TitleBar title="Qingshu (beta)" :fileName="fileName" @open-file="openFile" @save-file="saveFile"
            @save-as="saveAs" />
        <!-- <Editor id="editor-container" ref="editor" /> -->
        <SimpleEditor id="editor-container" ref="editor" />
        <StatusBar />
    </div>
</template>
    
<style scoped>
body {
    margin: 0;
    padding: 0;
}

#root-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
}

#editor-container {
    display: flex;
    flex-grow: 1;
    /* z-index: -5; */
    /* font-family: 'Fira Code', monospace; */
    /* font-size: 16px; */
    /* line-height: 1.5; */
    overflow: auto;
}
</style>
    