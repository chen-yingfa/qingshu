<script lang="ts">
import Editor from './components/Editor.vue'
import TitleBar from './components/TitleBar.vue'
import StatusBar from './components/StatusBar.vue'

const { ipcRenderer } = require('electron')
const fs = require('fs')


export default {
    name: 'App',
    components: {
        TitleBar,
        Editor,
        StatusBar,
    },
    data() {
        return {
            fileName: 'Untitled-1',
            isSelectedFile: false,
        }
    },
    methods: {
        openFile(): void {
            ipcRenderer.invoke('open-file')
                .then((paths: string[]) => {
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
        },
        saveFile(): void {
            if (this.isSelectedFile) {
                this.saveToFile(this.fileName)
            } else {
                this.saveAs()
            }
            return
        },
        saveAs(): void {
            ipcRenderer.invoke('save-file').then((path: string) => {
                console.log('got path:', path)
                if (path.length > 0) {
                    this.saveToFile(path)
                }
            })
        },
        saveToFile(path: string): void {
            console.log('saving to file:', path)
            let editor = this.getEditor()
            let content = editor.getAllContents()
            fs.writeFile(path, content, (err: any) => {
                if (err) {
                    console.error(err)
                    return
                }
                console.log('file saved')
                this.fileName = path
                this.isSelectedFile = true
            })
        },

        getEditor(): typeof Editor {
            return this.$refs.editor as typeof Editor
        },
    }
}

</script>
    
<template>
    <link href="../../styles/main.css" rel="stylesheet">
    <div id="root-container">
        <TitleBar title="Qingshu (beta)" 
                    :fileName="fileName"
                    @open-file="openFile"
                    @save-file="saveFile"
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
    