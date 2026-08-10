import {
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { normalizeCjkInput, spaceCjkLatin } from '../markdown/cjk'
import { parseBlocks, renderMarkdown, type MarkdownBlock } from '../markdown/markdown'

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

interface LiveEditorProps {
  content: string
  activeBlock: number
  formatRequest?: FormatRequest
  autoSpacing?: boolean
  previewAll?: boolean
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
  const separator = left && right ? '\n' : ''
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

function editorBlocks(content: string): MarkdownBlock[] {
  const blocks = parseBlocks(content)
  if (blocks.length === 0 || /\n\s*\n$/u.test(content)) {
    blocks.push({
      type: 'paragraph',
      source: '',
      start: content.length,
      end: content.length,
    })
  }
  return blocks
}

function RenderedBlock({
  block,
  onActivate,
  editable,
}: {
  block: MarkdownBlock
  onActivate(): void
  editable: boolean
}) {
  const [html, setHtml] = useState('')

  useEffect(() => {
    let current = true
    void renderMarkdown(block.source).then((rendered) => {
      if (current) setHtml(rendered)
    })
    return () => {
      current = false
    }
  }, [block.source])

  return (
    <div className="preview-block">
      <div
        className="rendered-block"
        onClick={(event) => {
          if (
            editable &&
            !(event.target as HTMLElement).closest(
              'a, button, input, select, textarea, summary',
            )
          ) {
            onActivate()
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
          onClick={onActivate}
        >
          Edit
        </button>
      )}
    </div>
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
  onChange,
  onActiveBlockChange,
}: LiveEditorProps) {
  const blocks = useMemo(() => editorBlocks(content), [content])
  const safeActive = Math.min(activeBlock, blocks.length - 1)
  const active = blocks[safeActive]
  const [draft, setDraft] = useState(active.source)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const contentRef = useRef(content)
  const rangeRef = useRef<SourceRange>({ start: active.start, end: active.end })
  const composingRef = useRef(false)
  const previousActiveRef = useRef(safeActive)
  const parentContentRef = useRef(content)
  const pendingAcknowledgementRef = useRef<string | undefined>(undefined)
  const handledFormatRef = useRef(0)
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
      setDraft(active.source)
      rangeRef.current = { start: active.start, end: active.end }
    }
    previousActiveRef.current = safeActive
  }, [active.end, active.source, active.start, content, safeActive])

  useLayoutEffect(() => {
    resizeTextarea(textareaRef.current)
  }, [draft, safeActive])

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
    setDraft(result.value)
    const nextContent = replaceBlockSource(
      contentRef.current,
      rangeRef.current,
      result.value,
    )
    contentRef.current = nextContent
    pendingAcknowledgementRef.current = nextContent
    onChange(nextContent)
    rangeRef.current.end = rangeRef.current.start + result.value.length
    afterPaint(() => {
      textarea.focus()
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd)
    })
  }, [content, draft, formatRequest, onChange])

  const commitDraft = (value: string) => {
    setDraft(value)
    const nextContent = replaceBlockSource(contentRef.current, rangeRef.current, value)
    rangeRef.current.end = rangeRef.current.start + value.length
    contentRef.current = nextContent
    pendingAcknowledgementRef.current = nextContent
    onChange(nextContent)
  }

  const normalize = (
    value: string,
    selectionStart = value.length,
    selectionEnd = selectionStart,
  ) => {
    if (composingRef.current) return
    const transform = (source: string) => {
      const normalized = normalizeCjkInput(source)
      return autoSpacing ? spaceCjkLatin(normalized) : normalized
    }
    const normalized = transform(value)
    if (normalized !== value) {
      const nextStart = transform(value.slice(0, selectionStart)).length
      const nextEnd = transform(value.slice(0, selectionEnd)).length
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
      (draft.slice(0, textarea.selectionStart).endsWith('\n') || draft === '')
    ) {
      event.preventDefault()
      const start = textarea.selectionStart
      const nextDraft = `${draft.slice(0, start)}\n${draft.slice(textarea.selectionEnd)}`
      commitDraft(nextDraft)
      onActiveBlockChange(safeActive + 1)
    }
  }

  return (
    <section className="editor" aria-label="Markdown document">
      {blocks.map((block, index) =>
        index === safeActive && !previewAll ? (
          <textarea
            key={`active-${safeActive}`}
            ref={textareaRef}
            className="source-block"
            aria-label="Active Markdown block"
            autoFocus
            spellCheck
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
            onBlur={(event) =>
              normalize(
                event.currentTarget.value,
                event.currentTarget.selectionStart,
                event.currentTarget.selectionEnd,
              )
            }
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
        ) : (
          <RenderedBlock
            key={`${block.start}-${block.end}-${index}`}
            block={block}
            editable={!previewAll}
            onActivate={() => onActiveBlockChange(index)}
          />
        ),
      )}
    </section>
  )
}
