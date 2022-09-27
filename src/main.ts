const { ipcRenderer } = require('electron');

const QUIT_BUTTON = document.getElementById('close-button');

QUIT_BUTTON.addEventListener('click', onClose)


function onClose() {
    console.log('closing window');
    ipcRenderer.send('close-window');
}