const { ipcRenderer } = require('electron');

const QUIT_BUTTON = document.getElementById('close-button');

QUIT_BUTTON.addEventListener('keydown', onClose)


function onClose() {
    console.log('closing window');
    ipcRenderer.send('close-window');
}