<script setup lang="ts">
import Editor from './components/Editor.vue'
import TitleBar from './components/TitleBar.vue'
import StatusBar from './components/StatusBar.vue'

import type { Ref } from 'vue'
import { ref } from 'vue'

const { ipcRenderer } = require('electron')  // Somehow this can't be changed to import
import * as fs from 'fs'

let fileName = ref('Untitled-1')
let isSelectedFile = ref(false)
let editor: Ref<typeof Editor | null> = ref(null)

function openFile() {
    ipcRenderer.invoke('open-file').then((paths: string[]) => {
        console.log('got files:', paths)
        if (paths.length > 0) {
            const path = paths[0]
            fs.readFile(path, 'utf-8', (err: any, data: string) => {
                if (err) {
                    console.error(err)
                    return
                }
                console.log(data)
            })
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
    ipcRenderer.invoke('save-file').then((path: string) => {
        console.log('got path:', path)
        if (path.length > 0) {
            saveToFile(path)
        }
    })
}
function saveToFile(path: string): void {
    console.log('saving to file:', path)
    let content = ''
    if (editor.value !== null) {
        content = editor.value.getAllContents()
    }
    fs.writeFile(path, content, (err: any) => {
        if (err) {
            console.error(err)
            return
        }
        console.log('file saved')
        fileName.value = path
        isSelectedFile.value = true
    })
}

</script>
    
<template>
    <link href="../../styles/main.css" rel="stylesheet">
    <div id="root-container">
        <TitleBar title="Qingshu (beta)" :fileName="fileName" @open-file="openFile" @save-file="saveFile"
            @save-as="saveAs" />
        <Editor id="editor-container" ref="editor" />
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
</style>
    