<script lang="ts" setup>

defineProps<{
    title: string
}>()

// const remote = require('electron').remote

function onClose() {
    console.log('closing window');
    // var win = remote.getCurrentWindow();
    // win.close();
}
</script>
    
    
<template>
    <div id="title-bar">
        <div class="title-bar-left-container">
            <button id="save-button">Save</button>
            <button id="open-button">Open</button>
        </div>
        <div class="title-bar-center-container">
            Qingshu (beta)
        </div>
        <div class="title-bar-right-container">
            <button id="minimize-button">-</button>
            <button id="maximize-button">+</button>
            <button id="close-button" @click="onClose">X</button>
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

#close-button:hover {
    background-color: rgb(240, 47, 74);
}
</style>