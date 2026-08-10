import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  CommandPalette,
  type PaletteCommand,
} from './components/CommandPalette'
import { LiveEditor, type FormatCommand } from './components/LiveEditor'
import { Icon } from './components/Icons'
import { StatusBar } from './components/StatusBar'
import { TitleBar } from './components/TitleBar'
import { ToastRegion, type ToastMessage } from './components/Toast'
import { Toolbar } from './components/Toolbar'
import { createHtmlDocument } from './export/html'
import { useDocument } from './hooks/useDocument'
import { spaceCjkLatin } from './markdown/cjk'
import { waitForPrintReadiness } from './print/readiness'
import type { MenuCommand } from './types/electron'

function filename(path: string): string {
  return path.split(/[\\/]/).at(-1) || path
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function formatShortcut(
  shortcut: string,
  isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform),
): string {
  if (!isMac) return shortcut
  return shortcut.replace(/^Ctrl\+Shift\+/, '⌘⇧').replace(/^Ctrl\+/, '⌘')
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

export default function App() {
  const { state, dispatch, newDocument, openDocument, saveDocument } = useDocument()
  const [dark, setDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )
  const [focus, setFocus] = useState(false)
  const [a4, setA4] = useState(false)
  const [autoSpacing, setAutoSpacing] = useState(false)
  const [printPreview, setPrintPreview] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const toastId = useRef(0)
  const activePdfExport = useRef<ActivePdfExport | null>(null)
  const [formatRequest, setFormatRequest] = useState<
    { id: number; command: FormatCommand } | undefined
  >()

  const addToast = useCallback((tone: ToastMessage['tone'], message: string) => {
    const id = ++toastId.current
    setToasts((current) => [...current.slice(-2), { id, tone, message }])
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

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

  const canDiscard = useCallback(
    () =>
      !state.dirty ||
      window.confirm('Discard the unsaved changes in this document?'),
    [state.dirty],
  )

  const runCommand = useCallback(
    async (command: MenuCommand) => {
      switch (command) {
        case 'new':
          if (canDiscard()) {
            newDocument()
            addToast('success', 'Created a new document')
          }
          break
        case 'open': {
          if (!canDiscard()) break
          const result = await openDocument()
          if (result.status === 'success') {
            addToast('success', `Opened ${filename(result.path)}`)
          } else if (result.status === 'error') {
            addToast('error', result.message)
          }
          break
        }
        case 'save': {
          const result = await saveDocument()
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
              addToast('success', `Exported ${filename(result.path)}`)
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
              addToast('success', `Exported ${filename(result.path)}`)
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
      canDiscard,
      dispatch,
      newDocument,
      openDocument,
      saveDocument,
      state.content,
      state.path,
    ],
  )

  const toggleOption = useCallback(
    (option: 'dark' | 'focus' | 'a4' | 'spacing') => {
      if (option === 'dark') setDark((value) => !value)
      if (option === 'focus') setFocus((value) => !value)
      if (option === 'a4') setA4((value) => !value)
      if (option === 'spacing') {
        setAutoSpacing((value) => {
          const enabled = !value
          if (enabled) {
            const spaced = spaceCjkLatin(state.content)
            if (spaced !== state.content) dispatch({ type: 'edit', content: spaced })
          }
          return enabled
        })
      }
    },
    [dispatch, state.content],
  )

  const commands = useMemo<PaletteCommand[]>(
    () => [
      {
        id: 'new',
        label: 'New document',
        shortcut: formatShortcut('Ctrl+N'),
        keywords: ['blank', 'file'],
        run: () => runCommand('new'),
      },
      {
        id: 'open',
        label: 'Open file',
        shortcut: formatShortcut('Ctrl+O'),
        keywords: ['load', 'document'],
        run: () => runCommand('open'),
      },
      {
        id: 'save',
        label: 'Save',
        shortcut: formatShortcut('Ctrl+S'),
        keywords: ['write', 'document'],
        run: () => runCommand('save'),
      },
      {
        id: 'save-as',
        label: 'Save as',
        shortcut: formatShortcut('Ctrl+Shift+S'),
        keywords: ['copy', 'rename', 'document'],
        run: () => runCommand('save-as'),
      },
      {
        id: 'export-html',
        label: 'Export HTML',
        keywords: ['web', 'standalone', 'document'],
        run: () => runCommand('export-html'),
      },
      {
        id: 'export-pdf',
        label: 'Export PDF',
        keywords: ['print', 'a4', 'document'],
        run: () => runCommand('export-pdf'),
      },
      {
        id: 'theme',
        label: 'Toggle color theme',
        keywords: ['dark', 'light', 'appearance'],
        run: () => toggleOption('dark'),
      },
      {
        id: 'focus',
        label: 'Toggle focus mode',
        keywords: ['distraction', 'zen', 'view'],
        run: () => toggleOption('focus'),
      },
      {
        id: 'a4',
        label: 'Toggle A4 preview',
        keywords: ['page', 'paper', 'view'],
        run: () => toggleOption('a4'),
      },
      {
        id: 'spacing',
        label: 'Toggle automatic CJK spacing',
        keywords: ['chinese', 'latin', 'space', '中文'],
        run: () => toggleOption('spacing'),
      },
    ],
    [runCommand, toggleOption],
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
      if (event.key === 'Escape' && focus && !paletteOpen) {
        event.preventDefault()
        setFocus(false)
        return
      }
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key.toLowerCase() === 'p') {
        event.preventDefault()
        setPaletteOpen(true)
        return
      }
      const command =
        event.key.toLowerCase() === 's'
          ? event.shiftKey
            ? 'save-as'
            : 'save'
          : event.key.toLowerCase() === 'o'
            ? 'open'
            : event.key.toLowerCase() === 'n'
              ? 'new'
              : undefined
      if (command) {
        event.preventDefault()
        void runCommand(command)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focus, paletteOpen, runCommand])

  return (
    <div
      className={[
        'app-shell',
        dark ? 'theme-dark' : 'theme-light',
        focus ? 'focus-mode' : '',
        a4 ? 'a4-mode' : '',
      ].join(' ')}
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
        onFile={(command) => void runCommand(command)}
        onFormat={(command) =>
          setFormatRequest((request) => ({ id: (request?.id ?? 0) + 1, command }))
        }
        onToggle={toggleOption}
      />
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
      <main className="workspace">
        <div className="paper">
          <LiveEditor
            content={state.content}
            activeBlock={state.activeBlock}
            formatRequest={formatRequest}
            autoSpacing={autoSpacing}
            previewAll={printPreview}
            onPreviewReady={handlePreviewReady}
            onChange={(content) => dispatch({ type: 'edit', content })}
            onActiveBlockChange={(index) => dispatch({ type: 'activate', index })}
          />
        </div>
      </main>
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
      <ToastRegion toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
