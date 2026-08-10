import {
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { normalizeCjkInput } from '../markdown/cjk'
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
}: {
  block: MarkdownBlock
  onActivate(): void
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
    <div
      className="rendered-block"
      role="button"
      tabIndex={0}
      aria-label="Edit Markdown block"
      onClick={onActivate}
      onFocus={onActivate}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onActivate()
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function resizeTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return
  textarea.style.height = '0'
  textarea.style.height = `${Math.max(textarea.scrollHeight, 32)}px`
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
  const handledFormatRef = useRef(0)
  contentRef.current = content

  useEffect(() => {
    if (previousActiveRef.current !== safeActive) {
      previousActiveRef.current = safeActive
      setDraft(active.source)
      rangeRef.current = { start: active.start, end: active.end }
    }
  }, [active.end, active.source, active.start, safeActive])

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
    onChange(nextContent)
    rangeRef.current.end = rangeRef.current.start + result.value.length
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd)
    })
  }, [content, draft, formatRequest, onChange])

  const commitDraft = (value: string) => {
    setDraft(value)
    const nextContent = replaceBlockSource(contentRef.current, rangeRef.current, value)
    rangeRef.current.end = rangeRef.current.start + value.length
    contentRef.current = nextContent
    onChange(nextContent)
  }

  const normalize = (value: string) => {
    if (composingRef.current) return
    const normalized = normalizeCjkInput(value)
    if (normalized !== value) commitDraft(normalized)
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
      const next = moveByCjkWord(draft, textarea.selectionStart, direction)
      textarea.setSelectionRange(next, next)
      return
    }

    if (event.key === 'Backspace' && textarea.selectionStart === 0 && safeActive > 0) {
      event.preventDefault()
      const merged = mergeBlockAtStart(contentRef.current, rangeRef.current.start)
      const previousStart = blocks[safeActive - 1].start
      contentRef.current = merged.content
      onChange(merged.content)
      onActiveBlockChange(safeActive - 1)
      requestAnimationFrame(() => {
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
        index === safeActive ? (
          <textarea
            key={`active-${safeActive}`}
            ref={textareaRef}
            className="source-block"
            aria-label="Active Markdown block"
            autoFocus
            spellCheck
            value={draft}
            onChange={(event) => commitDraft(event.currentTarget.value)}
            onBlur={(event) => normalize(event.currentTarget.value)}
            onCompositionStart={() => {
              composingRef.current = true
            }}
            onCompositionEnd={(event) => {
              composingRef.current = false
              normalize(event.currentTarget.value)
            }}
            onKeyDown={handleKeyDown}
          />
        ) : (
          <RenderedBlock
            key={`${block.start}-${block.end}-${index}`}
            block={block}
            onActivate={() => onActiveBlockChange(index)}
          />
        ),
      )}
    </section>
  )
}
