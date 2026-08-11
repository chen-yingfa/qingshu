export const SETTINGS_STORAGE_KEY = 'qingshu:settings:v1'

export type DocumentFont = 'sans' | 'serif' | 'mono'
export type ThemePreference = 'system' | 'light' | 'dark'
export type ShortcutAction =
  | 'palette'
  | 'new'
  | 'open'
  | 'save'
  | 'saveAs'
  | 'exportHtml'
  | 'exportPdf'
  | 'bold'
  | 'italic'
  | 'inlineCode'
  | 'inlineMath'
  | 'theme'
  | 'focus'
  | 'a4'
  | 'spacing'
  | 'settings'

export interface AppSettings {
  theme: ThemePreference
  defaultA4: boolean
  autoSpacing: boolean
  font: DocumentFont
  fontSize: number
  shortcuts: Record<ShortcutAction, string>
}

export const SHORTCUT_ACTIONS: Array<{
  id: ShortcutAction
  label: string
}> = [
  { id: 'palette', label: 'Command palette' },
  { id: 'settings', label: 'Settings' },
  { id: 'new', label: 'New document' },
  { id: 'open', label: 'Open file' },
  { id: 'save', label: 'Save' },
  { id: 'saveAs', label: 'Save as' },
  { id: 'exportHtml', label: 'Export HTML' },
  { id: 'exportPdf', label: 'Export PDF' },
  { id: 'bold', label: 'Bold' },
  { id: 'italic', label: 'Italic' },
  { id: 'inlineCode', label: 'Inline code' },
  { id: 'inlineMath', label: 'Inline math' },
  { id: 'theme', label: 'Toggle color theme' },
  { id: 'focus', label: 'Toggle focus mode' },
  { id: 'a4', label: 'Toggle A4 preview' },
  { id: 'spacing', label: 'Toggle automatic CJK spacing' },
]

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  defaultA4: false,
  autoSpacing: false,
  font: 'sans',
  fontSize: 17,
  shortcuts: {
    palette: 'Ctrl+P',
    settings: 'Ctrl+,',
    new: 'Ctrl+N',
    open: 'Ctrl+O',
    save: 'Ctrl+S',
    saveAs: 'Ctrl+Shift+S',
    exportHtml: '',
    exportPdf: '',
    bold: 'Ctrl+B',
    italic: 'Ctrl+I',
    inlineCode: 'Ctrl+`',
    inlineMath: 'Ctrl+M',
    theme: '',
    focus: '',
    a4: '',
    spacing: '',
  },
}

function cloneDefaults(): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    shortcuts: { ...DEFAULT_SETTINGS.shortcuts },
  }
}

export function loadSettings(raw: string | null): AppSettings {
  const settings = cloneDefaults()
  if (!raw) return settings
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (value.theme === 'system' || value.theme === 'light' || value.theme === 'dark') {
      settings.theme = value.theme
    }
    if (typeof value.defaultA4 === 'boolean') settings.defaultA4 = value.defaultA4
    if (typeof value.autoSpacing === 'boolean') {
      settings.autoSpacing = value.autoSpacing
    }
    if (value.font === 'sans' || value.font === 'serif' || value.font === 'mono') {
      settings.font = value.font
    }
    if (
      typeof value.fontSize === 'number' &&
      Number.isFinite(value.fontSize) &&
      value.fontSize >= 12 &&
      value.fontSize <= 32
    ) {
      settings.fontSize = value.fontSize
    }
    if (value.shortcuts && typeof value.shortcuts === 'object') {
      for (const { id } of SHORTCUT_ACTIONS) {
        const shortcut = (value.shortcuts as Record<string, unknown>)[id]
        if (typeof shortcut === 'string') settings.shortcuts[id] = shortcut
      }
    }
  } catch {
    return settings
  }
  return settings
}

interface ShortcutEvent {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

function normalizedKey(key: string): string {
  if (key === ' ') return 'Space'
  if (key.length === 1) return key.toUpperCase()
  return key
}

export function eventToShortcut(event: ShortcutEvent): string | undefined {
  if (['Control', 'Meta', 'Shift', 'Alt'].includes(event.key)) return undefined
  if (
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    (event.key.length === 1 || event.key === ' ')
  ) {
    return undefined
  }
  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl')
  if (event.shiftKey) parts.push('Shift')
  if (event.altKey) parts.push('Alt')
  parts.push(normalizedKey(event.key))
  return parts.join('+')
}

export function matchesShortcut(
  event: ShortcutEvent,
  shortcut: string,
): boolean {
  if (!shortcut) return false
  const parts = shortcut.split('+')
  const key = parts.at(-1) ?? ''
  const ctrl = parts.includes('Ctrl')
  const shift = parts.includes('Shift')
  const alt = parts.includes('Alt')
  return (
    Boolean(event.ctrlKey || event.metaKey) === ctrl &&
    event.shiftKey === shift &&
    event.altKey === alt &&
    normalizedKey(event.key) === key
  )
}

export function shortcutLabel(shortcut: string, isMac: boolean): string {
  if (!shortcut || !isMac) return shortcut
  return shortcut
    .replace(/^Ctrl\+/, '⌘')
    .replace('Shift+', '⇧')
    .replace('Alt+', '⌥')
}
