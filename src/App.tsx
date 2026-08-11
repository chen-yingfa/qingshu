import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  CommandPalette,
  type PaletteCommand,
} from './components/CommandPalette'
import { LiveEditor, type FormatCommand } from './components/LiveEditor'
import { Icon } from './components/Icons'
import { StatusBar } from './components/StatusBar'
import { SettingsDialog } from './components/SettingsDialog'
import { TabStrip } from './components/TabStrip'
import { TitleBar } from './components/TitleBar'
import { ToastRegion, type ToastMessage } from './components/Toast'
import { Toolbar } from './components/Toolbar'
import { createHtmlDocument } from './export/html'
import { useDocument } from './hooks/useDocument'
import { spaceCjkLatin } from './markdown/cjk'
import { waitForPrintReadiness } from './print/readiness'
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  SHORTCUT_ACTIONS,
  loadSettings,
  matchesShortcut,
  shortcutLabel,
  type AppSettings,
  type ShortcutAction,
} from './settings'
import type { MenuCommand } from './types/electron'

function filename(path: string): string {
  return path.split(/[\\/]/).at(-1) || path
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function showExportLabel(
  platform = navigator.platform,
): string {
  if (/Mac|iPhone|iPad/u.test(platform)) return 'Show in Finder'
  if (/Win/u.test(platform)) return 'Show in File Explorer'
  return 'Show in folder'
}

export function formatShortcut(
  shortcut: string,
  isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform),
): string {
  return shortcutLabel(shortcut, isMac)
}

function createPreviewBarrier() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((ready, failed) => {
    resolve = ready
    reject = failed
  })
  return { promise, resolve, reject }
}

type ActivePdfExport = ReturnType<typeof createPreviewBarrier> & {
  controller: AbortController
}

function resolvesDark(theme: AppSettings['theme']): boolean {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

function initialSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    const loaded = loadSettings(raw)
    let migrateLegacy = !raw
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (
          !parsed ||
          typeof parsed !== 'object' ||
          Array.isArray(parsed)
        ) {
          migrateLegacy = true
        }
      } catch {
        migrateLegacy = true
      }
    }
    if (migrateLegacy) {
      const legacyFont = window.localStorage.getItem('qingshu:document-font')
      if (
        legacyFont === 'sans' ||
        legacyFont === 'serif' ||
        legacyFont === 'mono'
      ) {
        loaded.font = legacyFont
      }
    }
    return loaded
  } catch {
    return loadSettings(null)
  }
}

export default function App() {
  const [settings, setSettings] = useState(initialSettings)
  const {
    state,
    dispatch,
    tabs,
    activeTabId,
    activateTab,
    closeTab,
    newDocument,
    openDocument,
    openRecentDocument,
    saveDocument,
  } = useDocument(settings.defaultSourceMode)
  const [dark, setDark] = useState(() => resolvesDark(settings.theme))
  const [focus, setFocus] = useState(false)
  const [a4, setA4] = useState(settings.defaultA4)
  const [autoSpacing, setAutoSpacing] = useState(settings.autoSpacing)
  const sourceMode = state.sourceMode
  const [printPreview, setPrintPreview] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [recentPaths, setRecentPaths] = useState<string[]>([])
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const toastId = useRef(0)
  const settingsStorageWarned = useRef(false)
  const activePdfExport = useRef<ActivePdfExport | null>(null)
  const formatRequestId = useRef(0)
  const recentRefreshGeneration = useRef(0)
  const [formatRequest, setFormatRequest] = useState<
    { id: number; command: FormatCommand } | undefined
  >()

  const requestFormat = useCallback((command: FormatCommand) => {
    setFormatRequest({
      id: ++formatRequestId.current,
      command,
    })
  }, [])

  const addToast = useCallback(
    (
      tone: ToastMessage['tone'],
      message: string,
      action?: ToastMessage['action'],
    ) => {
      const id = ++toastId.current
      setToasts((current) => [
        ...current.slice(-2),
        { id, tone, message, ...(action ? { action } : {}) },
      ])
    },
    [],
  )

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const refreshRecents = useCallback(async () => {
    const generation = ++recentRefreshGeneration.current
    try {
      const result = await window.qingshu.listRecentFiles()
      for (const warning of result.warnings ?? (result.warning ? [result.warning] : [])) {
        addToast('warning', warning)
      }
      for (const path of result.removed) {
        addToast('warning', `Removed missing recent file: ${filename(path)}`)
      }
      if (generation !== recentRefreshGeneration.current) return
      setRecentPaths(result.paths)
    } catch (error) {
      if (generation !== recentRefreshGeneration.current) return
      addToast('error', errorMessage(error))
    }
  }, [addToast])

  useEffect(() => {
    void refreshRecents()
  }, [refreshRecents])

  const revealExport = useCallback(
    async (path: string) => {
      try {
        await window.qingshu.showItemInFolder(path)
      } catch (error) {
        addToast('error', errorMessage(error))
      }
    },
    [addToast],
  )

  const handlePreviewReady = useCallback((error?: Error) => {
    if (error) activePdfExport.current?.reject(error)
    else activePdfExport.current?.resolve()
  }, [])

  useEffect(
    () => () => {
      activePdfExport.current?.controller.abort()
    },
    [],
  )

  useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
      window.localStorage.setItem('qingshu:document-font', settings.font)
    } catch {
      if (!settingsStorageWarned.current) {
        settingsStorageWarned.current = true
        addToast(
          'warning',
          'Settings could not be saved and will apply only for this session.',
        )
      }
    }
  }, [addToast, settings])

  useEffect(() => {
    if (settings.theme !== 'system') return undefined
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return undefined
    const update = (event: MediaQueryListEvent) => setDark(event.matches)
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [settings.theme])

  const canDiscard = useCallback(
    () =>
      !tabs.some((tab) => tab.dirty) ||
      window.confirm('Discard the unsaved changes in all open documents?'),
    [tabs],
  )

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((candidate) => candidate.id === tabId)
      if (
        tab?.dirty &&
        !window.confirm(
          `Discard the unsaved changes in ${tab.path ? filename(tab.path) : 'Untitled'}?`,
        )
      ) {
        return
      }
      closeTab(tabId)
    },
    [closeTab, tabs],
  )

  const openRecent = useCallback(
    async (path: string) => {
      const result = await openRecentDocument(path)
      if (result.status === 'success') {
        addToast('success', `Opened ${filename(result.path)}`)
      } else {
        addToast('error', result.message)
      }
      await refreshRecents()
    },
    [addToast, openRecentDocument, refreshRecents],
  )

  const runCommand = useCallback(
    async (command: MenuCommand) => {
      switch (command) {
        case 'new':
          newDocument()
          addToast('success', 'Created a new document')
          break
        case 'open': {
          const result = await openDocument()
          if (result.status === 'success') {
            addToast('success', `Opened ${filename(result.path)}`)
            await refreshRecents()
          } else if (result.status === 'error') {
            addToast('error', result.message)
          }
          break
        }
        case 'save': {
          const result = await saveDocument()
          if (
            result.status !== 'canceled' &&
            result.status !== 'error' &&
            result.path
          ) {
            await refreshRecents()
          }
          if (result.status === 'success') {
            addToast('success', `Saved ${filename(result.path)}`)
          } else if (result.status === 'warning') {
            addToast(
              'warning',
              `Saved ${filename(result.path)} with warning: ${result.message}`,
            )
          } else if (
            result.status === 'superseded' &&
            result.path &&
            result.warning
          ) {
            addToast(
              'warning',
              `Durability warning for ${filename(result.path)}: ${result.warning}`,
            )
          } else if (result.status === 'error') {
            addToast('error', result.message)
          }
          break
        }
        case 'save-as': {
          const result = await saveDocument(true)
          if (
            result.status !== 'canceled' &&
            result.status !== 'error' &&
            result.path
          ) {
            await refreshRecents()
          }
          if (result.status === 'success') {
            addToast('success', `Saved ${filename(result.path)}`)
          } else if (result.status === 'warning') {
            addToast(
              'warning',
              `Saved ${filename(result.path)} with warning: ${result.message}`,
            )
          } else if (
            result.status === 'superseded' &&
            result.path &&
            result.warning
          ) {
            addToast(
              'warning',
              `Durability warning for ${filename(result.path)}: ${result.warning}`,
            )
          } else if (result.status === 'error') {
            addToast('error', result.message)
          }
          break
        }
        case 'export-html': {
          try {
            const result = await window.qingshu.exportHtml({
              html: await createHtmlDocument(state.content, state.path),
            })
            if (!result.canceled) {
              dispatch({ type: 'error', message: null })
              addToast('success', `Exported ${filename(result.path)}`, {
                label: showExportLabel(),
                onClick: () => void revealExport(result.path),
              })
            }
          } catch (error) {
            const message = errorMessage(error)
            dispatch({
              type: 'error',
              message,
            })
            addToast('error', message)
          }
          break
        }
        case 'export-pdf': {
          if (activePdfExport.current) {
            addToast('error', 'PDF export is already in progress.')
            break
          }
          const active = {
            ...createPreviewBarrier(),
            controller: new AbortController(),
          }
          activePdfExport.current = active
          setPrintPreview(true)
          try {
            await waitForPrintReadiness(active.promise, document, {
              signal: active.controller.signal,
            })
            const result = await window.qingshu.exportPdf()
            if (!result.canceled) {
              dispatch({ type: 'error', message: null })
              addToast('success', `Exported ${filename(result.path)}`, {
                label: showExportLabel(),
                onClick: () => void revealExport(result.path),
              })
            }
          } catch (error) {
            const message = errorMessage(error)
            dispatch({
              type: 'error',
              message,
            })
            addToast('error', message)
          } finally {
            active.controller.abort()
            if (activePdfExport.current === active) activePdfExport.current = null
            setPrintPreview(false)
          }
          break
        }
      }
    },
    [
      addToast,
      dispatch,
      newDocument,
      openDocument,
      revealExport,
      refreshRecents,
      saveDocument,
      state.content,
      state.path,
    ],
  )

  const applySettings = useCallback(
    (next: AppSettings) => {
      setSettings(next)
      if (next.theme !== settings.theme) setDark(resolvesDark(next.theme))
      if (next.defaultA4 !== settings.defaultA4) setA4(next.defaultA4)
      if (next.defaultSourceMode !== settings.defaultSourceMode) {
        setFormatRequest(undefined)
        dispatch({ type: 'source-mode', enabled: next.defaultSourceMode })
      }
      if (
        next.autoSpacing !== settings.autoSpacing &&
        next.autoSpacing &&
        !autoSpacing
      ) {
        const spaced = spaceCjkLatin(state.content)
        if (spaced !== state.content) dispatch({ type: 'edit', content: spaced })
      }
      if (next.autoSpacing !== settings.autoSpacing) {
        setAutoSpacing(next.autoSpacing)
      }
    },
    [autoSpacing, dispatch, settings, state.content],
  )

  const toggleOption = useCallback(
    (option: 'dark' | 'focus' | 'a4' | 'spacing' | 'source') => {
      if (option === 'dark') {
        setDark((value) => {
          const next = !value
          setSettings((current) => ({
            ...current,
            theme: next ? 'dark' : 'light',
          }))
          return next
        })
      }
      if (option === 'focus') setFocus((value) => !value)
      if (option === 'a4') {
        setA4((value) => {
          const next = !value
          setSettings((current) => ({ ...current, defaultA4: next }))
          return next
        })
      }
      if (option === 'spacing') {
        setAutoSpacing((value) => {
          const enabled = !value
          if (enabled) {
            const spaced = spaceCjkLatin(state.content)
            if (spaced !== state.content) dispatch({ type: 'edit', content: spaced })
          }
          setSettings((current) => ({
            ...current,
            autoSpacing: enabled,
          }))
          return enabled
        })
      }
      if (option === 'source') {
        setFormatRequest(undefined)
        const next = !state.sourceMode
        if (next) dispatch({ type: 'activate', index: 0 })
        dispatch({ type: 'source-mode', enabled: next })
      }
    },
    [dispatch, state.content, state.sourceMode],
  )

  const commands = useMemo<PaletteCommand[]>(
    () => [
      {
        id: 'new',
        label: 'New document',
        shortcut: formatShortcut(settings.shortcuts.new) || undefined,
        keywords: ['blank', 'file'],
        run: () => runCommand('new'),
      },
      {
        id: 'open',
        label: 'Open file',
        shortcut: formatShortcut(settings.shortcuts.open) || undefined,
        keywords: ['load', 'document'],
        run: () => runCommand('open'),
      },
      {
        id: 'save',
        label: 'Save',
        shortcut: formatShortcut(settings.shortcuts.save) || undefined,
        keywords: ['write', 'document'],
        run: () => runCommand('save'),
      },
      {
        id: 'save-as',
        label: 'Save as',
        shortcut: formatShortcut(settings.shortcuts.saveAs) || undefined,
        keywords: ['copy', 'rename', 'document'],
        run: () => runCommand('save-as'),
      },
      {
        id: 'export-html',
        label: 'Export HTML',
        shortcut: formatShortcut(settings.shortcuts.exportHtml) || undefined,
        keywords: ['web', 'standalone', 'document'],
        run: () => runCommand('export-html'),
      },
      {
        id: 'export-pdf',
        label: 'Export PDF',
        shortcut: formatShortcut(settings.shortcuts.exportPdf) || undefined,
        keywords: ['print', 'a4', 'document'],
        run: () => runCommand('export-pdf'),
      },
      {
        id: 'theme',
        label: 'Toggle color theme',
        shortcut: formatShortcut(settings.shortcuts.theme) || undefined,
        keywords: ['dark', 'light', 'appearance'],
        run: () => toggleOption('dark'),
      },
      {
        id: 'focus',
        label: 'Toggle focus mode',
        shortcut: formatShortcut(settings.shortcuts.focus) || undefined,
        keywords: ['distraction', 'zen', 'view'],
        run: () => toggleOption('focus'),
      },
      {
        id: 'a4',
        label: 'Toggle A4 preview',
        shortcut: formatShortcut(settings.shortcuts.a4) || undefined,
        keywords: ['page', 'paper', 'view'],
        run: () => toggleOption('a4'),
      },
      {
        id: 'spacing',
        label: 'Toggle automatic CJK spacing',
        shortcut: formatShortcut(settings.shortcuts.spacing) || undefined,
        keywords: ['chinese', 'latin', 'space', '中文'],
        run: () => toggleOption('spacing'),
      },
      {
        id: 'bold',
        label: 'Bold',
        shortcut: formatShortcut(settings.shortcuts.bold) || undefined,
        keywords: ['format', 'strong'],
        run: () => requestFormat('bold'),
      },
      {
        id: 'italic',
        label: 'Italic',
        shortcut: formatShortcut(settings.shortcuts.italic) || undefined,
        keywords: ['format', 'emphasis'],
        run: () => requestFormat('italic'),
      },
      {
        id: 'inline-code',
        label: 'Inline code',
        shortcut:
          formatShortcut(settings.shortcuts.inlineCode) || undefined,
        keywords: ['format', 'code', 'backtick'],
        run: () => requestFormat('code'),
      },
      {
        id: 'inline-math',
        label: 'Inline math',
        shortcut:
          formatShortcut(settings.shortcuts.inlineMath) || undefined,
        keywords: ['format', 'latex', 'equation'],
        run: () => requestFormat('math'),
      },
      {
        id: 'source-mode',
        label: 'Toggle source mode',
        shortcut:
          formatShortcut(settings.shortcuts.sourceMode) || undefined,
        keywords: ['markdown', 'raw', 'source', 'editor'],
        run: () => toggleOption('source'),
      },
      {
        id: 'settings',
        label: 'Settings',
        shortcut: formatShortcut(settings.shortcuts.settings) || undefined,
        keywords: ['preferences', 'font', 'hotkeys', 'defaults'],
        run: () => setSettingsOpen(true),
      },
      ...recentPaths.map((path) => ({
        id: `recent:${path}`,
        label: `Open ${filename(path)}`,
        keywords: ['recent', 'file', path],
        run: () => openRecent(path),
      })),
    ],
    [openRecent, recentPaths, requestFormat, runCommand, settings.shortcuts, toggleOption],
  )

  const executeShortcutAction = useCallback(
    (action: ShortcutAction) => {
      const menuCommands: Partial<Record<ShortcutAction, MenuCommand>> = {
        new: 'new',
        open: 'open',
        save: 'save',
        saveAs: 'save-as',
        exportHtml: 'export-html',
        exportPdf: 'export-pdf',
      }
      const formatCommands: Partial<Record<ShortcutAction, FormatCommand>> = {
        bold: 'bold',
        italic: 'italic',
        inlineCode: 'code',
        inlineMath: 'math',
      }
      const options: Partial<
        Record<
          ShortcutAction,
          'dark' | 'focus' | 'a4' | 'spacing' | 'source'
        >
      > = {
        theme: 'dark',
        focus: 'focus',
        a4: 'a4',
        spacing: 'spacing',
        sourceMode: 'source',
      }
      if (action === 'palette') {
        setPaletteOpen((open) => !open)
        return
      }
      if (action === 'settings') {
        setPaletteOpen(false)
        setSettingsOpen(true)
        return
      }
      const menu = menuCommands[action]
      if (menu) {
        void runCommand(menu)
        return
      }
      const format = formatCommands[action]
      if (format) {
        requestFormat(format)
        return
      }
      const option = options[action]
      if (option) toggleOption(option)
    },
    [requestFormat, runCommand, toggleOption],
  )

  useEffect(() => window.qingshu.onMenuCommand((command) => void runCommand(command)), [
    runCommand,
  ])

  useEffect(
    () =>
      window.qingshu.onCloseIntent(() => {
        void window.qingshu.respondToClose(canDiscard())
      }),
    [canDiscard],
  )

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (
        settingsOpen ||
        event.repeat ||
        event.defaultPrevented ||
        event.isComposing ||
        event.key === 'Process'
      ) {
        return
      }
      if (event.key === 'Escape' && focus && !paletteOpen) {
        event.preventDefault()
        setFocus(false)
        return
      }
      const action = SHORTCUT_ACTIONS.find(({ id }) =>
        matchesShortcut(event, settings.shortcuts[id]),
      )?.id
      if (!action || (paletteOpen && action !== 'palette')) return
      if (
        ['bold', 'italic', 'inlineCode', 'inlineMath'].includes(action) &&
        !(
          event.target instanceof HTMLTextAreaElement &&
          (event.target.classList.contains('source-block') ||
            event.target.classList.contains('source-document'))
        )
      ) {
        return
      }
      event.preventDefault()
      executeShortcutAction(action)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    executeShortcutAction,
    focus,
    paletteOpen,
    settings.shortcuts,
    settingsOpen,
  ])

  return (
    <div
      className={[
        'app-shell',
        dark ? 'theme-dark' : 'theme-light',
        focus ? 'focus-mode' : '',
        a4 ? 'a4-mode' : '',
        sourceMode ? 'source-mode' : '',
        `font-${settings.font}`,
        `tabs-${settings.tabOrientation}`,
      ].join(' ')}
      style={
        {
          '--document-font-size': `${settings.fontSize}px`,
        } as CSSProperties
      }
    >
      <TitleBar
        path={state.path}
        dirty={state.dirty}
        onClose={() => void window.qingshu.windowAction('close')}
      />
      <Toolbar
        dark={dark}
        focus={focus}
        a4={a4}
        autoSpacing={autoSpacing}
        sourceMode={sourceMode}
        documentFont={settings.font}
        recentPaths={recentPaths}
        onFile={(command) => void runCommand(command)}
        onFormat={requestFormat}
        onFontChange={(font) => setSettings((current) => ({ ...current, font }))}
        onSettings={() => setSettingsOpen(true)}
        onRecent={(path) => void openRecent(path)}
        onToggle={toggleOption}
      />
      {settings.tabOrientation === 'horizontal' && (
        <TabStrip
          tabs={tabs}
          activeTabId={activeTabId}
          orientation="horizontal"
          onActivate={activateTab}
          onClose={handleCloseTab}
        />
      )}
      {focus && !printPreview && (
        <button
          type="button"
          className="exit-focus-button"
          aria-label="Exit focus mode"
          title="Exit focus mode (Escape)"
          onClick={() => setFocus(false)}
        >
          <Icon name="close" />
        </button>
      )}
      <div className="workspace-layout">
        {settings.tabOrientation === 'vertical' && (
          <TabStrip
            tabs={tabs}
            activeTabId={activeTabId}
            orientation="vertical"
            onActivate={activateTab}
            onClose={handleCloseTab}
          />
        )}
        <main
          className="workspace"
          id={`document-panel-${activeTabId}`}
          role="tabpanel"
          aria-labelledby={`document-tab-${activeTabId}`}
        >
          <div className="paper">
            <LiveEditor
            key={activeTabId}
            content={state.content}
            contentRevision={state.contentRevision}
            activeBlock={state.activeBlock}
            formatRequest={formatRequest}
            autoSpacing={autoSpacing}
            sourceMode={sourceMode}
            selection={state.selection}
            previewAll={printPreview}
            onPreviewReady={handlePreviewReady}
            onChange={(content) => dispatch({ type: 'edit', content })}
            onActiveBlockChange={(index) => dispatch({ type: 'activate', index })}
            onSelectionChange={(selection) =>
              dispatch({ type: 'selection', selection })
            }
            />
          </div>
        </main>
      </div>
      <StatusBar
        content={state.content}
        error={state.error}
        path={state.path}
        activeBlock={state.activeBlock}
        dirty={state.dirty}
      />
      {paletteOpen && (
        <CommandPalette commands={commands} onDismiss={() => setPaletteOpen(false)} />
      )}
      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          onChange={applySettings}
          onDismiss={() => setSettingsOpen(false)}
        />
      )}
      <ToastRegion toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
