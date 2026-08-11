import {
  memo,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { normalizeCjkInput, spaceCjkLatin } from '../markdown/cjk'
import { highlightCode, parseFencedCode } from '../markdown/code'
import {
  parseDocument,
  renderDocumentFootnotes,
  renderMarkdown,
  renderMarkdownBlock,
  type DocumentRenderContext,
  type MarkdownBlock,
} from '../markdown/markdown'

export type FormatCommand =
  | 'heading'
  | 'bold'
  | 'italic'
  | 'link'
  | 'code'
  | 'quote'
  | 'unordered-list'

interface SourceRange {
  start: number
  end: number
}

interface FormatRequest {
  id: number
  command: FormatCommand
}

function preferredEol(source: string): '\n' | '\r\n' {
  return source.includes('\r\n') ? '\r\n' : '\n'
}

function toEditorValue(source: string): string {
  return source.replaceAll('\r\n', '\n')
}

function toSourceValue(value: string, eol: '\n' | '\r\n'): string {
  return eol === '\r\n' ? value.replaceAll('\n', '\r\n') : value
}

function separatesParagraphWithOneEol(source: string, eol: '\n' | '\r\n') {
  return parseDocument(`${source}${eol}qingshu-empty-probe`).blocks.length > 1
}

interface LiveEditorProps {
  content: string
  activeBlock: number
  formatRequest?: FormatRequest
  autoSpacing?: boolean
  previewAll?: boolean
  onPreviewReady?(error?: Error): void
  onChange(content: string): void
  onActiveBlockChange(index: number): void
}

export function replaceBlockSource(
  source: string,
  range: SourceRange,
  replacement: string,
): string {
  return source.slice(0, range.start) + replacement + source.slice(range.end)
}

export function mergeBlockAtStart(
  source: string,
  blockStart: number,
): { content: string; caret: number } {
  const separatorStart = source.slice(0, blockStart).search(/\s+$/)
  if (separatorStart < 0) return { content: source, caret: blockStart }
  const left = source.slice(0, separatorStart).replace(/[ \t]+$/u, '')
  const right = source.slice(blockStart).replace(/^[ \t]+/u, '')
  const separator = left && right ? preferredEol(source) : ''
  return { content: left + separator + right, caret: left.length + separator.length }
}

export function applyInlineFormat(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
): { value: string; selectionStart: number; selectionEnd: number } {
  const selection = value.slice(start, end)
  return {
    value: value.slice(0, start) + before + selection + after + value.slice(end),
    selectionStart: start + before.length,
    selectionEnd: end + before.length,
  }
}

export function moveByCjkWord(
  value: string,
  position: number,
  direction: -1 | 1,
): number {
  const segments = Array.from(
    new Intl.Segmenter('zh', { granularity: 'word' }).segment(value),
  )
  if (direction > 0) {
    const next = segments.find((segment) => segment.index > position)
    return next?.index ?? value.length
  }
  const previous = segments.filter((segment) => segment.index < position).at(-1)
  return previous?.index ?? 0
}

function editorBlocks(
  content: string,
  parsedBlocks: MarkdownBlock[],
  insertedEmptyOffsets: number[],
): MarkdownBlock[] {
  if (parsedBlocks.length === 0) {
    return [{
      id: 'empty-tail',
      type: 'paragraph',
      source: '',
      start: content.length,
      end: content.length,
    }]
  }

  const editable = [...parsedBlocks]
  for (const offset of insertedEmptyOffsets) {
    if (
      offset < 0 ||
      offset > content.length ||
      parsedBlocks.some(
        (block) =>
          block.start === offset || (offset > block.start && offset < block.end),
      )
    ) {
      continue
    }
    editable.push({
      id: `empty-inserted-${offset}`,
      type: 'paragraph',
      source: '',
      start: offset,
      end: offset,
    })
  }

  const last = parsedBlocks.at(-1)!
  const trailing = content.slice(last.end)
  const trailingEndings = Array.from(trailing.matchAll(/\r?\n/gu))
  for (let empty = 0; empty + 1 < trailingEndings.length; empty += 2) {
    const second = trailingEndings[empty + 1]
    const offset = last.end + second.index! + second[0].length
    if (!editable.some((block) => block.start === offset && block.source === '')) {
      editable.push({
        id: `empty-tail-${offset}`,
        type: 'paragraph',
        source: '',
        start: offset,
        end: offset,
      })
    }
  }
  return editable.sort((left, right) => left.start - right.start)
}

function containsMath(source: string): boolean {
  return (
    /(^|[^\\])\$\$[\s\S]+?\$\$/u.test(source) ||
    /(^|[^\\])\$(?!\$)(?:\\.|[^$\n])+\$/u.test(source)
  )
}

function ActiveBlockPreview({ source }: { source: string }) {
  const code = useMemo(() => parseFencedCode(source), [source])
  const [mathHtml, setMathHtml] = useState('')
  const [codeHtml, setCodeHtml] = useState('')

  useEffect(() => {
    let current = true
    const timer = window.setTimeout(() => {
      if (code) {
        setMathHtml('')
        setCodeHtml(highlightCode(code.code, code.language))
      } else if (containsMath(source)) {
        setCodeHtml('')
        void renderMarkdown(source).then(
          (html) => {
            if (current) setMathHtml(html)
          },
          () => {
            if (current) setMathHtml('')
          },
        )
      } else {
        setCodeHtml('')
        setMathHtml('')
      }
    }, 80)
    return () => {
      current = false
      window.clearTimeout(timer)
    }
  }, [code, source])

  if (code) {
    return (
      <div className="active-live-preview active-code-preview" aria-label="Live code preview">
        <div className="preview-label">
          {code.language || 'Plain text'} · live preview
        </div>
        <pre>
          <code
            className={`hljs${code.language ? ` language-${code.language}` : ''}`}
            dangerouslySetInnerHTML={{ __html: codeHtml }}
          />
        </pre>
      </div>
    )
  }

  if (!containsMath(source) || !mathHtml) return null
  return (
    <div className="active-live-preview active-math-preview" aria-label="Live math preview">
      <div className="preview-label">Math · live preview</div>
      <div
        className="rendered-block"
        dangerouslySetInnerHTML={{ __html: mathHtml }}
      />
    </div>
  )
}

function FullDocumentPreview({
  content,
  onReady,
}: {
  content: string
  onReady?(error?: Error): void
}) {
  const [rendered, setRendered] = useState<{ source: string; html: string } | null>(null)

  useEffect(() => {
    let current = true
    void renderMarkdown(content).then(
      (html) => {
        if (current) setRendered({ source: content, html })
      },
      (error: unknown) => {
        if (current) {
          onReady?.(error instanceof Error ? error : new Error(String(error)))
        }
      },
    )
    return () => {
      current = false
    }
  }, [content, onReady])

  useLayoutEffect(() => {
    if (rendered?.source === content) onReady?.()
  }, [content, onReady, rendered])

  const ready = rendered?.source === content
  return (
    <div
      className="preview-block print-document"
      data-print-document=""
      data-render-ready={ready ? 'true' : 'false'}
    >
      <div
        className="rendered-block"
        dangerouslySetInnerHTML={{ __html: ready ? rendered.html : '' }}
      />
    </div>
  )
}

function deferWork(callback: () => void): () => void {
  if ('requestIdleCallback' in globalThis) {
    const id = globalThis.requestIdleCallback(callback)
    return () => globalThis.cancelIdleCallback(id)
  }
  const id = setTimeout(callback, 0)
  return () => clearTimeout(id)
}

const RenderedBlock = memo(function RenderedBlock({
  block,
  context,
  index,
  onActivate,
  editable,
}: {
  block: MarkdownBlock
  context: DocumentRenderContext
  index: number
  onActivate(index: number): void
  editable: boolean
}) {
  const [html, setHtml] = useState('')

  useEffect(() => {
    let current = true
    const cancel = deferWork(() => {
      void renderMarkdownBlock(block, context).then((rendered) => {
        if (current) setHtml(rendered)
      })
    })
    return () => {
      current = false
      cancel()
    }
  }, [block, context])

  return (
    <div className="preview-block" data-block-id={block.id}>
      <div
        className="rendered-block"
        onClick={(event) => {
          if (
            editable &&
            !(event.target as HTMLElement).closest(
              'a, button, input, select, textarea, summary',
            )
          ) {
            onActivate(index)
          }
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {editable && (
        <button
          type="button"
          className="edit-block-button"
          aria-label="Edit Markdown block"
          title="Edit Markdown block"
          onClick={() => onActivate(index)}
        >
          Edit
        </button>
      )}
    </div>
  )
}, (previous, next) =>
  previous.block.id === next.block.id &&
  previous.block.source === next.block.source &&
  previous.context.signature === next.context.signature &&
  previous.index === next.index &&
  previous.onActivate === next.onActivate &&
  previous.editable === next.editable,
)

function DocumentFootnotes({ context }: { context: DocumentRenderContext }) {
  const [html, setHtml] = useState('')

  useEffect(() => {
    let current = true
    const cancel = deferWork(() => {
      void renderDocumentFootnotes(context).then((rendered) => {
        if (current) setHtml(rendered)
      })
    })
    return () => {
      current = false
      cancel()
    }
  }, [context])

  if (!html) return null
  return (
    <div
      className="preview-block document-footnotes"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function resizeTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return
  textarea.style.height = '0'
  textarea.style.height = `${Math.max(textarea.scrollHeight, 32)}px`
}

function afterPaint(callback: () => void) {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(callback)
  } else {
    setTimeout(callback, 0)
  }
}

function prefixLines(
  value: string,
  start: number,
  end: number,
  prefix: string,
): ReturnType<typeof applyInlineFormat> {
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const selected = value.slice(lineStart, end)
  const replacement = selected
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n')
  return {
    value: value.slice(0, lineStart) + replacement + value.slice(end),
    selectionStart: start + prefix.length,
    selectionEnd: lineStart + replacement.length,
  }
}

function formattedValue(
  command: FormatCommand,
  value: string,
  start: number,
  end: number,
) {
  switch (command) {
    case 'bold':
      return applyInlineFormat(value, start, end, '**', '**')
    case 'italic':
      return applyInlineFormat(value, start, end, '_', '_')
    case 'code':
      return applyInlineFormat(value, start, end, '`', '`')
    case 'link':
      return applyInlineFormat(value, start, end, '[', '](url)')
    case 'heading':
      return prefixLines(value, start, end, '# ')
    case 'quote':
      return prefixLines(value, start, end, '> ')
    case 'unordered-list':
      return prefixLines(value, start, end, '- ')
  }
}

export function LiveEditor({
  content,
  activeBlock,
  formatRequest,
  autoSpacing = false,
  previewAll = false,
  onPreviewReady,
  onChange,
  onActiveBlockChange,
}: LiveEditorProps) {
  const insertedEmptyOffsetsRef = useRef<number[]>([])
  const model = useMemo(() => parseDocument(content), [content])
  const blocks = useMemo(
    () => editorBlocks(content, model.blocks, insertedEmptyOffsetsRef.current),
    [content, model.blocks],
  )
  const renderContext = model.renderContext
  const safeActive = Math.min(activeBlock, blocks.length - 1)
  const active = blocks[safeActive]
  const [draft, setDraft] = useState(toEditorValue(active.source))
  const fencedCode = useMemo(() => parseFencedCode(draft), [draft])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const contentRef = useRef(content)
  const rangeRef = useRef<SourceRange>({ start: active.start, end: active.end })
  const composingRef = useRef(false)
  const codeTabEscapeRef = useRef(false)
  const previousActiveRef = useRef(safeActive)
  const parentContentRef = useRef(content)
  const pendingAcknowledgementRef = useRef<string | undefined>(undefined)
  const handledFormatRef = useRef(0)
  const activationRef = useRef(onActiveBlockChange)
  activationRef.current = onActiveBlockChange
  const activateBlock = useCallback((index: number) => {
    activationRef.current(index)
  }, [])
  contentRef.current = content

  useLayoutEffect(() => {
    const activeChanged = previousActiveRef.current !== safeActive
    const parentChanged = content !== parentContentRef.current
    const acknowledged =
      parentChanged && pendingAcknowledgementRef.current === content
    if (parentChanged) {
      parentContentRef.current = content
      pendingAcknowledgementRef.current = undefined
    }
    const externalChange = parentChanged && !acknowledged
    if (activeChanged || externalChange) {
      setDraft(toEditorValue(active.source))
      rangeRef.current = { start: active.start, end: active.end }
    }
    if (externalChange) insertedEmptyOffsetsRef.current = []
    if (activeChanged) codeTabEscapeRef.current = false
    previousActiveRef.current = safeActive
  }, [active.end, active.source, active.start, content, safeActive])

  useLayoutEffect(() => {
    resizeTextarea(textareaRef.current)
  }, [draft, safeActive])

  function commitDraft(value: string) {
    const eol = preferredEol(contentRef.current)
    const sourceValue = toSourceValue(value, eol)
    const previous = { ...rangeRef.current }
    const nextContent = replaceBlockSource(
      contentRef.current,
      previous,
      sourceValue,
    )
    const delta = sourceValue.length - (previous.end - previous.start)
    insertedEmptyOffsetsRef.current = insertedEmptyOffsetsRef.current
      .filter(
        (offset) =>
          !(previous.start === previous.end && offset === previous.start && value),
      )
      .map((offset) => (offset > previous.end ? offset + delta : offset))
    setDraft(value)
    rangeRef.current.end = rangeRef.current.start + sourceValue.length
    contentRef.current = nextContent
    pendingAcknowledgementRef.current = nextContent
    onChange(nextContent)
  }

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea || !formatRequest || formatRequest.id === handledFormatRef.current) return
    handledFormatRef.current = formatRequest.id
    const result = formattedValue(
      formatRequest.command,
      draft,
      textarea.selectionStart,
      textarea.selectionEnd,
    )
    commitDraft(result.value)
    afterPaint(() => {
      textarea.focus()
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd)
    })
  }, [content, draft, formatRequest, onChange])

  const normalize = (
    value: string,
    selectionStart = value.length,
    selectionEnd = selectionStart,
  ) => {
    if (composingRef.current) return
    const eol = preferredEol(contentRef.current)
    const sourceValue = toSourceValue(value, eol)
    const candidate = replaceBlockSource(
      contentRef.current,
      rangeRef.current,
      sourceValue,
    )
    const transformTo = (end: number) => {
      const range = { start: rangeRef.current.start, end }
      let transformed = normalizeCjkInput(candidate, range)
      let transformedEnd = end + transformed.length - candidate.length
      if (autoSpacing) {
        const spaced = spaceCjkLatin(transformed, {
          start: range.start,
          end: transformedEnd,
        })
        transformedEnd += spaced.length - transformed.length
        transformed = spaced
      }
      return { source: transformed, end: transformedEnd }
    }
    const transformed = transformTo(
      rangeRef.current.start + sourceValue.length,
    )
    const normalized = toEditorValue(
      transformed.source.slice(rangeRef.current.start, transformed.end),
    )
    if (normalized !== value) {
      const transformedStart = transformTo(
        rangeRef.current.start +
          toSourceValue(value.slice(0, selectionStart), eol).length,
      )
      const transformedEnd = transformTo(
        rangeRef.current.start +
          toSourceValue(value.slice(0, selectionEnd), eol).length,
      )
      const nextStart = toEditorValue(
        transformedStart.source.slice(
          rangeRef.current.start,
          transformedStart.end,
        ),
      ).length
      const nextEnd = toEditorValue(
        transformedEnd.source.slice(
          rangeRef.current.start,
          transformedEnd.end,
        ),
      ).length
      commitDraft(normalized)
      afterPaint(() => {
        textareaRef.current?.setSelectionRange(nextStart, nextEnd)
      })
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || composingRef.current) return
    const textarea = event.currentTarget

    if (
      event.ctrlKey &&
      !event.altKey &&
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    ) {
      event.preventDefault()
      const direction = event.key === 'ArrowLeft' ? -1 : 1
      const backwardSelection = textarea.selectionDirection === 'backward'
      const focus = backwardSelection ? textarea.selectionStart : textarea.selectionEnd
      const anchor = backwardSelection ? textarea.selectionEnd : textarea.selectionStart
      const next = moveByCjkWord(draft, focus, direction)
      if (event.shiftKey) {
        textarea.setSelectionRange(
          Math.min(anchor, next),
          Math.max(anchor, next),
          next < anchor ? 'backward' : 'forward',
        )
      } else {
        textarea.setSelectionRange(next, next)
      }
      return
    }

    if (fencedCode && event.key === 'Escape') {
      codeTabEscapeRef.current = true
      return
    }
    if (event.key !== 'Tab') codeTabEscapeRef.current = false

    if (fencedCode && event.key === 'Tab') {
      if (codeTabEscapeRef.current) {
        codeTabEscapeRef.current = false
        return
      }
      event.preventDefault()
      if (event.shiftKey) {
        const lineStart =
          draft.lastIndexOf('\n', Math.max(0, textarea.selectionStart - 1)) + 1
        const indentation = draft.slice(lineStart).match(/^(?: {1,2}|\t)/u)?.[0] ?? ''
        if (!indentation) return
        const nextDraft =
          draft.slice(0, lineStart) +
          draft.slice(lineStart + indentation.length)
        const nextStart = Math.max(lineStart, textarea.selectionStart - indentation.length)
        const nextEnd = Math.max(nextStart, textarea.selectionEnd - indentation.length)
        commitDraft(nextDraft)
        afterPaint(() => {
          textareaRef.current?.setSelectionRange(nextStart, nextEnd)
        })
        return
      }
      const result = applyInlineFormat(
        draft,
        textarea.selectionStart,
        textarea.selectionEnd,
        '  ',
        '',
      )
      commitDraft(result.value)
      afterPaint(() => {
        textareaRef.current?.setSelectionRange(
          result.selectionStart,
          result.selectionEnd,
        )
      })
      return
    }

    if (
      fencedCode &&
      event.key === 'Enter' &&
      !event.shiftKey &&
      !(
        fencedCode.closed &&
        textarea.selectionStart === draft.length &&
        textarea.selectionEnd === draft.length
      )
    ) {
      event.preventDefault()
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      if (!fencedCode.closed && !draft.includes('\n') && start === draft.length) {
        const nextDraft = `${draft}\n\n${fencedCode.fence}`
        commitDraft(nextDraft)
        afterPaint(() => {
          const caret = draft.length + 1
          textareaRef.current?.setSelectionRange(caret, caret)
        })
        return
      }
      const lineStart = draft.lastIndexOf('\n', Math.max(0, start - 1)) + 1
      const indentation = draft.slice(lineStart, start).match(/^[ \t]*/u)?.[0] ?? ''
      const insertion = `\n${indentation}`
      const nextDraft = draft.slice(0, start) + insertion + draft.slice(end)
      commitDraft(nextDraft)
      afterPaint(() => {
        const caret = start + insertion.length
        textareaRef.current?.setSelectionRange(caret, caret)
      })
      return
    }

    if (event.key === 'Backspace' && textarea.selectionStart === 0 && safeActive > 0) {
      event.preventDefault()
      const merged = mergeBlockAtStart(contentRef.current, rangeRef.current.start)
      const previousStart = blocks[safeActive - 1].start
      contentRef.current = merged.content
      pendingAcknowledgementRef.current = merged.content
      onChange(merged.content)
      onActiveBlockChange(safeActive - 1)
      afterPaint(() => {
        const input = textareaRef.current
        const localCaret = Math.max(0, merged.caret - previousStart)
        input?.setSelectionRange(localCaret, localCaret)
      })
      return
    }

    if (
      event.key === 'ArrowUp' &&
      textarea.selectionStart === 0 &&
      safeActive > 0
    ) {
      event.preventDefault()
      onActiveBlockChange(safeActive - 1)
      return
    }

    if (
      event.key === 'ArrowDown' &&
      textarea.selectionEnd === draft.length &&
      safeActive < blocks.length - 1
    ) {
      event.preventDefault()
      onActiveBlockChange(safeActive + 1)
      return
    }

    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      textarea.selectionStart === draft.length &&
      textarea.selectionEnd === draft.length
    ) {
      event.preventDefault()
      const insertionPoint = rangeRef.current.end
      const eol = preferredEol(contentRef.current)
      const insertion = `${eol}${eol}`
      const leftSeparators = separatesParagraphWithOneEol(active.source, eol)
        ? 1
        : 2
      const emptyOffset = insertionPoint + leftSeparators * eol.length
      insertedEmptyOffsetsRef.current = [
        ...insertedEmptyOffsetsRef.current.map((offset) =>
          offset > insertionPoint ? offset + insertion.length : offset,
        ),
        emptyOffset,
      ].filter((offset, index, offsets) => offsets.indexOf(offset) === index)
      const nextContent =
        contentRef.current.slice(0, insertionPoint) +
        insertion +
        contentRef.current.slice(insertionPoint)
      contentRef.current = nextContent
      pendingAcknowledgementRef.current = nextContent
      onChange(nextContent)
      onActiveBlockChange(safeActive + 1)
    }
  }

  return (
    <section className="editor" aria-label="Markdown document">
      {previewAll ? (
        <FullDocumentPreview content={content} onReady={onPreviewReady} />
      ) : (
        blocks.map((block, index) =>
          index === safeActive ? (
            <div className="active-block" key={`active-${safeActive}`}>
              <textarea
                ref={textareaRef}
                className={
                  fencedCode ? 'source-block source-block-code' : 'source-block'
                }
                aria-label={fencedCode ? 'Active code block' : 'Active Markdown block'}
                autoFocus
                spellCheck={!fencedCode}
                value={draft}
                onChange={(event) => {
                  const textarea = event.currentTarget
                  commitDraft(textarea.value)
                  if (!composingRef.current && autoSpacing) {
                    normalize(
                      textarea.value,
                      textarea.selectionStart,
                      textarea.selectionEnd,
                    )
                  }
                }}
                onBlur={(event) => {
                  codeTabEscapeRef.current = false
                  normalize(
                    event.currentTarget.value,
                    event.currentTarget.selectionStart,
                    event.currentTarget.selectionEnd,
                  )
                }}
                onCompositionStart={() => {
                  composingRef.current = true
                }}
                onCompositionEnd={(event) => {
                  composingRef.current = false
                  normalize(
                    event.currentTarget.value,
                    event.currentTarget.selectionStart,
                    event.currentTarget.selectionEnd,
                  )
                }}
                onKeyDown={handleKeyDown}
              />
              <ActiveBlockPreview source={draft} />
            </div>
          ) : (
            <RenderedBlock
              key={block.id}
              block={block}
              context={renderContext}
              editable
              index={index}
              onActivate={activateBlock}
            />
          ),
        )
      )}
      {!previewAll && <DocumentFootnotes context={renderContext} />}
    </section>
  )
}
