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
  | 'sourceMode'
  | 'nextTab'
  | 'previousTab'
  | 'closeTab'
  | 'settings'

export interface AppSettings {
  theme: ThemePreference
  tabOrientation: 'horizontal' | 'vertical'
  defaultA4: boolean
  defaultSourceMode: boolean
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
  { id: 'sourceMode', label: 'Toggle source mode' },
  { id: 'nextTab', label: 'Next tab' },
  { id: 'previousTab', label: 'Previous tab' },
  { id: 'closeTab', label: 'Close current tab' },
]

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  tabOrientation: 'horizontal',
  defaultA4: false,
  defaultSourceMode: false,
  autoSpacing: false,
  font: 'sans',
  fontSize: 17,
  shortcuts: {
    palette: 'Mod+P',
    settings: 'Mod+,',
    new: 'Mod+N',
    open: 'Mod+O',
    save: 'Mod+S',
    saveAs: 'Mod+Shift+S',
    exportHtml: '',
    exportPdf: '',
    bold: 'Mod+B',
    italic: 'Mod+I',
    inlineCode: 'Mod+Shift+C',
    inlineMath: 'Mod+Shift+M',
    theme: '',
    focus: '',
    a4: '',
    spacing: '',
    sourceMode: 'Mod+Shift+E',
    nextTab: 'Ctrl+Tab',
    previousTab: 'Ctrl+Shift+Tab',
    closeTab: 'Mod+W',
  },
}

function cloneDefaults(): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    shortcuts: { ...DEFAULT_SETTINGS.shortcuts },
  }
}

export function loadSettings(
  raw: string | null,
  isMac = typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad/u.test(navigator.platform),
): AppSettings {
  const settings = cloneDefaults()
  if (!raw) return settings
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (value.theme === 'system' || value.theme === 'light' || value.theme === 'dark') {
      settings.theme = value.theme
    }
    if (value.tabOrientation === 'horizontal' || value.tabOrientation === 'vertical') {
      settings.tabOrientation = value.tabOrientation
    }
    if (typeof value.defaultA4 === 'boolean') settings.defaultA4 = value.defaultA4
    if (typeof value.defaultSourceMode === 'boolean') {
      settings.defaultSourceMode = value.defaultSourceMode
    }
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
      const used = new Set<string>()
      for (const { id } of SHORTCUT_ACTIONS) {
        const shortcut = (value.shortcuts as Record<string, unknown>)[id]
        const persisted =
          typeof shortcut === 'string'
            ? canonicalizeShortcut(shortcut)
            : undefined
        const candidate = persisted ?? settings.shortcuts[id]
        const effective = shortcutSignature(candidate, isMac)
        settings.shortcuts[id] =
          effective && used.has(effective) ? '' : candidate
        if (effective && settings.shortcuts[id]) used.add(effective)
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
  if (key === '+') return 'Plus'
  if (key.length === 1) return key.toUpperCase()
  return key
}

export function eventToShortcut(event: ShortcutEvent): string | undefined {
  if (['Control', 'Meta', 'Shift', 'Alt'].includes(event.key)) return undefined
  if (!event.ctrlKey && !event.metaKey && !event.altKey) return undefined
  if (event.ctrlKey && event.metaKey) return undefined
  const parts: string[] = []
  if (event.metaKey) parts.push('Cmd')
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.shiftKey) parts.push('Shift')
  if (event.altKey) parts.push('Alt')
  parts.push(normalizedKey(event.key))
  return canonicalizeShortcut(parts.join('+'))
}

export function matchesShortcut(
  event: ShortcutEvent,
  shortcut: string,
  isMac = typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad/u.test(navigator.platform),
): boolean {
  const canonical = canonicalizeShortcut(shortcut)
  if (!canonical) return false
  const parts = canonical.split('+')
  const key = parts.at(-1) ?? ''
  const mod = parts.includes('Mod')
  const ctrl = parts.includes('Ctrl') || (mod && !isMac)
  const meta = parts.includes('Cmd') || (mod && isMac)
  const shift = parts.includes('Shift')
  const alt = parts.includes('Alt')
  return (
    event.ctrlKey === ctrl &&
    event.metaKey === meta &&
    event.shiftKey === shift &&
    event.altKey === alt &&
    normalizedKey(event.key) === key
  )
}

export function shortcutLabel(shortcut: string, isMac: boolean): string {
  const canonical = canonicalizeShortcut(shortcut)
  if (!canonical) return ''
  const parts = canonical.split('+')
  const key = parts.pop() ?? ''
  if (!isMac) {
    return [
      ...parts.map((part) => (part === 'Mod' ? 'Ctrl' : part === 'Cmd' ? 'Meta' : part)),
      key,
    ].join('+')
  }
  return (
    parts
      .map((part) => {
        if (part === 'Mod' || part === 'Cmd') return '⌘'
        if (part === 'Ctrl') return '⌃'
        if (part === 'Shift') return '⇧'
        if (part === 'Alt') return '⌥'
        return part
      })
      .join('') + key
  )
}

export function isValidShortcut(shortcut: string): boolean {
  return canonicalizeShortcut(shortcut) !== undefined
}

export function canonicalizeShortcut(
  shortcut: string,
): string | undefined {
  if (shortcut === '') return ''
  const parts = shortcut.split('+')
  if (parts.length < 2 || parts.some((part) => !part)) return undefined
  const key = normalizedKey(parts.at(-1)!)
  const modifiers = parts.slice(0, -1)
  const allowed = new Set(['Mod', 'Cmd', 'Ctrl', 'Shift', 'Alt'])
  const primaryCount = modifiers.filter((modifier) =>
    ['Mod', 'Cmd', 'Ctrl'].includes(modifier),
  ).length
  if (
    modifiers.some((modifier) => !allowed.has(modifier)) ||
    new Set(modifiers).size !== modifiers.length ||
    !key ||
    allowed.has(key) ||
    primaryCount > 1
  ) {
    return undefined
  }
  if (!modifiers.some((modifier) =>
    ['Mod', 'Cmd', 'Ctrl', 'Alt'].includes(modifier),
  )) {
    return undefined
  }
  const ordered = ['Mod', 'Cmd', 'Ctrl', 'Shift', 'Alt'].filter((modifier) =>
    modifiers.includes(modifier),
  )
  return [...ordered, key].join('+')
}

export function shortcutSignature(
  shortcut: string,
  isMac: boolean,
): string {
  const canonical = canonicalizeShortcut(shortcut)
  if (!canonical) return ''
  const parts = canonical.split('+')
  const key = parts.at(-1)
  const mod = parts.includes('Mod')
  return [
    parts.includes('Ctrl') || (mod && !isMac) ? 'ctrl' : '',
    parts.includes('Cmd') || (mod && isMac) ? 'meta' : '',
    parts.includes('Shift') ? 'shift' : '',
    parts.includes('Alt') ? 'alt' : '',
    key,
  ].join(':')
}
