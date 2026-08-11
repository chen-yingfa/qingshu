export type FileResult =
  | { canceled: true }
  | { canceled: false; path: string; content?: string; warning?: string }

export type ExportHtmlRequest = {
  html: string
}

export type WindowAction = 'minimize' | 'toggle-maximize' | 'close'

export type MenuCommand =
  | 'new'
  | 'open'
  | 'save'
  | 'save-as'
  | 'export-html'
  | 'export-pdf'

export interface QingshuApi {
  openFile(): Promise<FileResult>
  saveFile(request: { path?: string; content: string }): Promise<FileResult>
  exportHtml(request: ExportHtmlRequest): Promise<FileResult>
  exportPdf(): Promise<FileResult>
  showItemInFolder(path: string): Promise<void>
  windowAction(action: WindowAction): Promise<void>
  respondToClose(confirmed: boolean): Promise<void>
  onCloseIntent(listener: () => void): () => void
  onMenuCommand(listener: (command: MenuCommand) => void): () => void
}

declare global {
  interface Window {
    qingshu: QingshuApi
  }
}
