import { contextBridge, ipcRenderer } from 'electron'
import type {
  ExportHtmlRequest,
  QingshuApi,
  WindowAction,
} from '../../src/types/electron'

const api: QingshuApi = {
  openFile: () => ipcRenderer.invoke('qingshu:open-file'),
  chooseSavePath: () => ipcRenderer.invoke('qingshu:choose-save-path'),
  listRecentFiles: () => ipcRenderer.invoke('qingshu:list-recent-files'),
  openRecentFile: path =>
    ipcRenderer.invoke('qingshu:open-recent-file', path),
  saveFile: request => ipcRenderer.invoke('qingshu:save-file', request),
  cancelSave: saveToken => ipcRenderer.invoke('qingshu:cancel-save', saveToken),
  exportHtml: (request: ExportHtmlRequest) =>
    ipcRenderer.invoke('qingshu:export-html', request),
  exportPdf: () => ipcRenderer.invoke('qingshu:export-pdf'),
  showItemInFolder: path =>
    ipcRenderer.invoke('qingshu:show-item-in-folder', path),
  windowAction: (action: WindowAction) =>
    ipcRenderer.invoke('qingshu:window-action', action),
  respondToClose: confirmed =>
    ipcRenderer.invoke('qingshu:close-response', confirmed),
  onCloseIntent: listener => {
    const handler = () => listener()
    ipcRenderer.on('qingshu:close-intent', handler)
    return () => ipcRenderer.removeListener('qingshu:close-intent', handler)
  },
}

contextBridge.exposeInMainWorld('qingshu', api)
