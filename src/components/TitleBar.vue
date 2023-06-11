<script lang="ts" setup>

// import electron from 'electron'
// import { ipcRenderer } from 'electron'
const electron = require('electron')
const ipcRenderer = electron.ipcRenderer

defineProps<{
    title: string
    fileName: string
}>()

const emit = defineEmits<{
    (e: 'open-file'): void
    (e: 'save-file'): void
    (e: 'save-as'): void
}>()


function onClose(): void {
    console.log('closing window')
    ipcRenderer.invoke('close-window')
}

function onClickOpen(): void {
    console.log('open clicked')
    emit('open-file')
}

function onClickSave(): void {
    console.log('save clicked')
    emit('save-file')
}

function onClickSaveAs(): void {
    console.log('save as clicked')
    emit('save-as')
}

</script>
    
    
<template>
    <div id="title-bar">
        <div class="title-bar-left-container">
            <button id="open-button" @click="onClickOpen">Open</button>
            <button id="save-button" @click="onClickSave">Save</button>
            <button id="save-as-button" @click="onClickSaveAs">Save As</button>
        </div>
        <div class="title-bar-center-container">
            <span>{{ fileName }}</span> - Qingshu
        </div>
        <div class="title-bar-right-container">
            <button id="minimize-button">
                <img src="../assets/icons/minimize_FILL0_wght400_GRAD0_opsz48.svg">
            </button>
            <button id="maximize-button">
                <img src="../assets/icons/fullscreen_FILL0_wght400_GRAD0_opsz48.svg">
            </button>
            <button id="close-button" @click="onClose">
                <img src="../assets/icons/close_FILL0_wght400_GRAD0_opsz48.svg">
            </button>
        </div>
    </div>
</template>
    
<style scoped>
#title-bar {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    gap: 4px;

    height: 26px;
    font-size: 14px;
    color: #666666;
    box-shadow: rgba(0, 0, 0, 0.24) 0px 3px 8px;
    z-index: 1;

    -webkit-user-select: none;
    user-select: none;
    -webkit-app-region: drag;
}

.title-bar-left-container {
    display: flex;
    flex-direction: row;
    justify-content: flex-start;
    gap: 4px;
    padding: 4px;
}

.title-bar-center-container {
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: bold;
    line-height: 100%;
    /* font-family: 'KaiTi', 'Courier New', Courier, monospace; */
}

.title-bar-right-container {
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    height: 26px;
}

.title-bar-left-container button {
    border: none;
    background-color: transparent;
    color: black;
}

.title-bar-left-container button:hover {
    background-color: rgba(1, 1, 1, 0.1);
    border-radius: 6px;
}

.title-bar-right-container button {
    width: 40px;
    /* height: 100%; */
    /* border-radius: 50%; */
    border-width: 0px;
    border-radius: 0;
    color: black;
    background-color: transparent;
}

.title-bar-right-container button:hover {
    background-color: rgba(1, 1, 1, 0.1);
}

.title-bar-right-container img {
    height: 100%;
}

#close-button:hover {
    background-color: rgb(240, 47, 74);
}
</style>