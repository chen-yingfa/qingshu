import { contextBridge, ipcRenderer } from 'electron'
import type {
  ExportHtmlRequest,
  ExportPdfRequest,
  MenuCommand,
  QingshuApi,
  WindowAction,
} from '../../src/types/electron'

const api: QingshuApi = {
  openFile: () => ipcRenderer.invoke('qingshu:open-file'),
  saveFile: request => ipcRenderer.invoke('qingshu:save-file', request),
  exportHtml: (request: ExportHtmlRequest) =>
    ipcRenderer.invoke('qingshu:export-html', request),
  exportPdf: (request: ExportPdfRequest = {}) =>
    ipcRenderer.invoke('qingshu:export-pdf', request),
  windowAction: (action: WindowAction) =>
    ipcRenderer.invoke('qingshu:window-action', action),
  respondToClose: confirmed =>
    ipcRenderer.invoke('qingshu:close-response', confirmed),
  onCloseIntent: listener => {
    const handler = () => listener()
    ipcRenderer.on('qingshu:close-intent', handler)
    return () => ipcRenderer.removeListener('qingshu:close-intent', handler)
  },
  onMenuCommand: listener => {
    const handler = (_event: Electron.IpcRendererEvent, command: MenuCommand) => {
      listener(command)
    }
    ipcRenderer.on('qingshu:menu-command', handler)
    return () => ipcRenderer.removeListener('qingshu:menu-command', handler)
  },
}

contextBridge.exposeInMainWorld('qingshu', api)
