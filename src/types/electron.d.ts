export type FileResult =
  | { canceled: true }
  | { canceled: false; path: string; content?: string; warning?: string }

export type ExportHtmlRequest = {
  html: string
}

export type RecentFilesResult = {
  paths: string[]
  removed: string[]
  warning?: string
  warnings?: string[]
}

export type WindowAction = 'minimize' | 'toggle-maximize' | 'close'

export interface QingshuApi {
  openFile(): Promise<FileResult>
  chooseSavePath(): Promise<FileResult>
  listRecentFiles(): Promise<RecentFilesResult>
  openRecentFile(path: string): Promise<Extract<FileResult, { canceled: false }>>
  saveFile(request: {
    path?: string
    content: string
    saveToken: string
  }): Promise<FileResult>
  cancelSave(saveToken: string): Promise<void>
  exportHtml(request: ExportHtmlRequest): Promise<FileResult>
  exportPdf(): Promise<FileResult>
  showItemInFolder(path: string): Promise<void>
  windowAction(action: WindowAction): Promise<void>
  respondToClose(confirmed: boolean): Promise<void>
  onCloseIntent(listener: () => void): () => void
}

declare global {
  interface Window {
    qingshu: QingshuApi
  }
}
