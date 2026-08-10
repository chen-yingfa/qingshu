import { useCallback, useEffect, useState } from 'react'

import { LiveEditor, type FormatCommand } from './components/LiveEditor'
import { Icon } from './components/Icons'
import { StatusBar } from './components/StatusBar'
import { TitleBar } from './components/TitleBar'
import { Toolbar } from './components/Toolbar'
import { useDocument } from './hooks/useDocument'
import { spaceCjkLatin } from './markdown/cjk'
import { renderMarkdown } from './markdown/markdown'
import type { MenuCommand } from './types/electron'

function htmlDocument(body: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Qingshu export</title>
<style>body{max-width:760px;margin:48px auto;padding:0 28px;color:#24221f;font:17px/1.85 ui-serif,"Noto Serif CJK SC","Songti SC",serif}img{max-width:100%}pre{overflow:auto;padding:1em;background:#f5f3ef;border-radius:8px}code{font-family:ui-monospace,"SFMono-Regular",Consolas,monospace}blockquote{border-left:3px solid #a49379;margin-left:0;padding-left:1.2em;color:#67615a}</style>
</head>
<body>${body}</body>
</html>`
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    } else {
      setTimeout(resolve, 0)
    }
  })
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
  const [formatRequest, setFormatRequest] = useState<
    { id: number; command: FormatCommand } | undefined
  >()

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
          if (canDiscard()) newDocument()
          break
        case 'open':
          if (canDiscard()) await openDocument()
          break
        case 'save':
          await saveDocument()
          break
        case 'save-as':
          await saveDocument(true)
          break
        case 'export-html': {
          try {
            const body = await renderMarkdown(state.content)
            await window.qingshu.exportHtml({
              path: state.path,
              html: htmlDocument(body),
            })
          } catch (error) {
            dispatch({
              type: 'error',
              message: error instanceof Error ? error.message : String(error),
            })
          }
          break
        }
        case 'export-pdf':
          setPrintPreview(true)
          try {
            await waitForPaint()
            await window.qingshu.exportPdf(state.path ? { path: state.path } : undefined)
          } catch (error) {
            dispatch({
              type: 'error',
              message: error instanceof Error ? error.message : String(error),
            })
          } finally {
            setPrintPreview(false)
          }
          break
      }
    },
    [
      canDiscard,
      dispatch,
      newDocument,
      openDocument,
      saveDocument,
      state.content,
      state.path,
    ],
  )

  useEffect(() => window.qingshu.onMenuCommand((command) => void runCommand(command)), [
    runCommand,
  ])

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && focus) {
        event.preventDefault()
        setFocus(false)
        return
      }
      if (!(event.ctrlKey || event.metaKey)) return
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
  }, [focus, runCommand])

  const toggleOption = (option: 'dark' | 'focus' | 'a4' | 'spacing') => {
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
  }

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
        onClose={() => {
          if (canDiscard()) void window.qingshu.windowAction('close')
        }}
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
      {focus && (
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
            onChange={(content) => dispatch({ type: 'edit', content })}
            onActiveBlockChange={(index) => dispatch({ type: 'activate', index })}
          />
        </div>
      </main>
      <StatusBar content={state.content} error={state.error} path={state.path} />
    </div>
  )
}
