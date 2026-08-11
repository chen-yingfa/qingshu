import {
  Fragment,
  memo,
  type KeyboardEvent,
  type PointerEvent,
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
  frontMatterEnd,
  parseDocument,
  renderDocumentFootnotes,
  renderMarkdown,
  renderMarkdownBlock,
  type DocumentRenderContext,
  type MarkdownBlock,
} from '../markdown/markdown'
import { reorderMarkdownBlocks } from '../markdown/reorder'

export type FormatCommand =
  | 'heading'
  | 'bold'
  | 'italic'
  | 'link'
  | 'code'
  | 'math'
  | 'quote'
  | 'unordered-list'

interface SourceRange {
  start: number
  end: number
}

interface InsertedBlock {
  offset: number
  length: number
  leftPadding: number
  rightPadding: number
}

interface EditingBoundary {
  content: string
  start: number
  end: number
}

const EMPTY_RENDER_CONTEXT: DocumentRenderContext = {
  supportSource: '',
  footnoteSource: '',
  references: [],
  signature: '',
}

interface FormatRequest {
  id: number
  command: FormatCommand
}

function preferredEol(source: string): '\n' | '\r\n' {
  return source.includes('\r\n') ? '\r\n' : '\n'
}

function nearestEol(source: string, offset: number): '\n' | '\r\n' {
  const before = Array.from(source.slice(0, offset).matchAll(/\r\n|\n/gu)).at(-1)?.[0]
  if (before) return before as '\n' | '\r\n'
  const after = source.slice(offset).match(/\r\n|\n/u)?.[0]
  return (after as '\n' | '\r\n' | undefined) ?? preferredEol(source)
}

function toEditorValue(source: string): string {
  return source.replaceAll('\r\n', '\n')
}

function restoreSourceEols(
  value: string,
  previousSource: string,
  fallbackEol: '\n' | '\r\n',
): string {
  const previous = toEditorValue(previousSource)
  const previousEndings = Array.from(previousSource.matchAll(/\r\n|\n/gu), (match) =>
    match[0] as '\n' | '\r\n',
  )
  const nextEndingCount = Array.from(value.matchAll(/\n/gu)).length
  if (previousEndings.length === nextEndingCount) {
    let endingIndex = 0
    return value.replaceAll('\n', () => previousEndings[endingIndex++])
  }
  const endings = new Map<number, '\n' | '\r\n'>()
  let normalizedOffset = 0
  for (const part of previousSource.split(/(\r\n|\n)/u)) {
    if (part === '\n' || part === '\r\n') {
      endings.set(normalizedOffset, part)
      normalizedOffset += 1
    } else {
      normalizedOffset += part.length
    }
  }

  let prefix = 0
  while (
    prefix < previous.length &&
    prefix < value.length &&
    previous[prefix] === value[prefix]
  ) {
    prefix += 1
  }
  let suffix = 0
  while (
    suffix < previous.length - prefix &&
    suffix < value.length - prefix &&
    previous[previous.length - 1 - suffix] === value[value.length - 1 - suffix]
  ) {
    suffix += 1
  }

  let restored = ''
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '\n') {
      restored += value[index]
      continue
    }
    const previousIndex =
      index < prefix
        ? index
        : index >= value.length - suffix
          ? previous.length - (value.length - index)
          : undefined
    restored +=
      (previousIndex === undefined ? undefined : endings.get(previousIndex)) ??
      fallbackEol
  }
  return restored
}

function sourceOffsetForEditorOffset(
  sourceValue: string,
  editorOffset: number,
): number {
  let sourceOffset = 0
  let visibleOffset = 0
  while (sourceOffset < sourceValue.length && visibleOffset < editorOffset) {
    if (sourceValue.startsWith('\r\n', sourceOffset)) sourceOffset += 2
    else sourceOffset += 1
    visibleOffset += 1
  }
  return sourceOffset
}

function separatesParagraphWithOneEol(source: string, eol: '\n' | '\r\n') {
  return parseDocument(`${source}${eol}qingshu-empty-probe`).blocks.length > 1
}

interface LiveEditorBaseProps {
  content: string
  activeBlock: number
  formatRequest?: FormatRequest
  autoSpacing?: boolean
  previewAll?: boolean
  onPreviewReady?(error?: Error): void
  onChange(content: string): void
  onActiveBlockChange(index: number): void
}

type LiveEditorProps = LiveEditorBaseProps &
  (
    | { sourceMode: true; contentRevision: number }
    | { sourceMode?: false; contentRevision?: number }
    | { sourceMode: boolean; contentRevision: number }
  )

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
  const separator = left && right ? nearestEol(source, blockStart) : ''
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

export function textReplacement(before: string, after: string): {
  start: number
  end: number
  replacement: string
} {
  let start = 0
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  ) {
    start += 1
  }
  let suffix = 0
  while (
    suffix < before.length - start &&
    suffix < after.length - start &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1
  }
  return {
    start,
    end: before.length - suffix,
    replacement: after.slice(start, after.length - suffix),
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
  insertedBlocks: InsertedBlock[],
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
  for (const insertion of insertedBlocks) {
    const { offset, length } = insertion
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
      source: content.slice(offset, offset + length),
      start: offset,
      end: offset + length,
    })
  }

  const last = parsedBlocks.at(-1)!
  const trailing = content.slice(last.end)
  const trailingEndings = Array.from(trailing.matchAll(/\r?\n/gu))
  for (let empty = 0; empty + 1 < trailingEndings.length; empty += 2) {
    const second = trailingEndings[empty + 1]
    const offset = last.end + second.index! + second[0].length
    if (!editable.some((block) => block.start === offset)) {
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

function preserveEditingBoundary(
  content: string,
  blocks: MarkdownBlock[],
  boundary: EditingBoundary | null,
): MarkdownBlock[] {
  if (!boundary || boundary.content !== content) return blocks
  if (
    blocks.some(
      (block) =>
        block.start === boundary.start && block.end === boundary.end,
    )
  ) {
    return blocks
  }
  const containingIndex = blocks.findIndex(
    (block) =>
      block.start <= boundary.start && block.end >= boundary.end,
  )
  if (containingIndex < 0) return blocks
  const containing = blocks[containingIndex]
  const beforeRaw = content.slice(containing.start, boundary.start)
  const beforeSource = beforeRaw.replace(
    /(?:\r?\n[ \t]*){2,}$/u,
    '',
  )
  const afterRaw = content.slice(boundary.end, containing.end)
  const afterLeading =
    afterRaw.match(/^(?:[ \t]*\r?\n){2,}/u)?.[0].length ?? 0
  const afterSource = afterRaw.slice(afterLeading)
  const activeSource = content.slice(boundary.start, boundary.end)
  const activeType =
    parseDocument(activeSource).blocks[0]?.type ?? 'paragraph'
  const replacement: MarkdownBlock[] = []

  if (beforeSource) {
    replacement.push({
      id: `${containing.id}-before-${boundary.start}`,
      type: containing.type,
      source: beforeSource,
      start: containing.start,
      end: containing.start + beforeSource.length,
    })
  }
  replacement.push({
    id: `editing-boundary-${boundary.start}`,
    type: activeType,
    source: activeSource,
    start: boundary.start,
    end: boundary.end,
  })
  if (afterSource) {
    const afterStart = boundary.end + afterLeading
    replacement.push({
      id: `${containing.id}-after-${boundary.end}`,
      type: containing.type,
      source: afterSource,
      start: afterStart,
      end: afterStart + afterSource.length,
    })
  }

  return [
    ...blocks.slice(0, containingIndex),
    ...replacement,
    ...blocks.slice(containingIndex + 1),
  ]
}

function reorderInsertedBlocks(
  insertions: InsertedBlock[],
  previousBlocks: MarkdownBlock[],
  nextBlocks: MarkdownBlock[],
  fromIndex: number,
  boundary: number,
): InsertedBlock[] {
  const order = previousBlocks.map((_, index) => index)
  const [moved] = order.splice(fromIndex, 1)
  order.splice(boundary > fromIndex ? boundary - 1 : boundary, 0, moved)
  const newIndexByOld = new Map(
    order.map((oldIndex, newIndex) => [oldIndex, newIndex]),
  )

  return insertions.map((insertion) => {
    const sourceBlock = previousBlocks.findIndex(
      (block) =>
        block.start === insertion.offset &&
        block.end === insertion.offset + insertion.length,
    )
    if (sourceBlock >= 0) {
      const nextIndex = newIndexByOld.get(sourceBlock) ?? sourceBlock
      const next = nextBlocks[nextIndex]
      if (!next) return insertion
      const leftPadding =
        nextIndex > 0 ? next.start - nextBlocks[nextIndex - 1].end : 0
      const rightPadding =
        nextIndex === 0 && nextBlocks.length > 1
          ? nextBlocks[1].start - next.end
          : 0
      return {
        ...insertion,
        offset: next.start,
        leftPadding,
        rightPadding,
      }
    }

    const gap = previousBlocks.findIndex(
      (block, index) =>
        index < previousBlocks.length - 1 &&
        insertion.offset >= block.end &&
        insertion.offset <= previousBlocks[index + 1].start,
    )
    if (gap >= 0) {
      return {
        ...insertion,
        offset: nextBlocks[gap].end + (insertion.offset - previousBlocks[gap].end),
      }
    }

    const previousLast = previousBlocks.at(-1)
    const nextLast = nextBlocks.at(-1)
    if (
      previousLast &&
      nextLast &&
      insertion.offset >= previousLast.end
    ) {
      return {
        ...insertion,
        offset: nextLast.end + (insertion.offset - previousLast.end),
      }
    }
    return insertion
  })
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
    case 'code': {
      const selection = value.slice(start, end)
      const longestRun = Math.max(
        0,
        ...Array.from(selection.matchAll(/`+/gu), (match) => match[0].length),
      )
      const delimiter = '`'.repeat(longestRun + 1)
      const padding =
        selection.startsWith('`') ||
        selection.endsWith('`') ||
        (selection.trim() &&
          (/^\s/u.test(selection) || /\s$/u.test(selection)))
          ? ' '
          : ''
      return applyInlineFormat(
        value,
        start,
        end,
        delimiter + padding,
        padding + delimiter,
      )
    }
    case 'math': {
      const selection = value.slice(start, end)
      const escaped = selection.replace(
        /(\\*)\$/gu,
        (match, slashes: string) =>
          slashes.length % 2 === 0 ? `${slashes}\\$` : match,
      )
      return {
        value: value.slice(0, start) + '$' + escaped + '$' + value.slice(end),
        selectionStart: start + 1,
        selectionEnd: start + 1 + escaped.length,
      }
    }
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

function DocumentSourceEditor({
  content,
  contentRevision,
  formatRequest,
  onChange,
}: {
  content: string
  contentRevision: number
  formatRequest?: FormatRequest
  onChange(content: string): void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const handledFormatRef = useRef(0)
  const [draft, setDraft] = useState(toEditorValue(content))
  const parentContentRef = useRef(content)
  const canonicalContentRef = useRef(content)
  const lastParentRevisionRef = useRef(contentRevision)
  const nextLocalRevisionRef = useRef(contentRevision)
  const pendingAcknowledgementsRef = useRef(
    new Map<number, string>(),
  )

  useLayoutEffect(() => {
    if (
      content === parentContentRef.current &&
      contentRevision === lastParentRevisionRef.current
    ) {
      return
    }
    if (
      contentRevision < lastParentRevisionRef.current
    ) {
      return
    }

    let acknowledged = false
    const pending = pendingAcknowledgementsRef.current
    acknowledged = pending.get(contentRevision) === content
    if (acknowledged) {
      for (const revision of pending.keys()) {
        if (revision <= contentRevision) pending.delete(revision)
      }
    } else if (
      contentRevision <= nextLocalRevisionRef.current &&
      contentRevision > lastParentRevisionRef.current
    ) {
      // A coalesced intermediate acknowledgement no longer retained in the
      // bounded queue; it must not overwrite a newer local draft.
      acknowledged = true
    }
    lastParentRevisionRef.current = contentRevision
    nextLocalRevisionRef.current = Math.max(
      nextLocalRevisionRef.current,
      contentRevision,
    )

    parentContentRef.current = content
    if (!acknowledged) {
      pendingAcknowledgementsRef.current.clear()
      canonicalContentRef.current = content
      setDraft(toEditorValue(content))
    }
  }, [content, contentRevision])

  const commit = (value: string, editorOffset = value.length) => {
    const previousCanonical = canonicalContentRef.current
    const sourceOffset = sourceOffsetForEditorOffset(
      previousCanonical,
      editorOffset,
    )
    const canonical = restoreSourceEols(
      value,
      previousCanonical,
      nearestEol(previousCanonical, sourceOffset),
    )
    canonicalContentRef.current = canonical
    setDraft(value)
    const revision = ++nextLocalRevisionRef.current
    pendingAcknowledgementsRef.current.set(revision, canonical)
    while (pendingAcknowledgementsRef.current.size > 32) {
      const oldest = pendingAcknowledgementsRef.current.keys().next().value
      if (oldest === undefined) break
      pendingAcknowledgementsRef.current.delete(oldest)
    }
    onChange(canonical)
  }

  const applyNativeEdit = (
    result: ReturnType<typeof formattedValue>,
  ) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const change = textReplacement(draft, result.value)
    textarea.focus()
    textarea.setSelectionRange(change.start, change.end)
    const nativeApplied =
      typeof document.execCommand === 'function' &&
      document.execCommand('insertText', false, change.replacement) &&
      textarea.value === result.value
    if (!nativeApplied) {
      textarea.setRangeText(
        change.replacement,
        change.start,
        change.end,
        'preserve',
      )
      commit(textarea.value, result.selectionEnd)
    }
    afterPaint(() => {
      textarea.focus()
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd)
    })
  }

  useEffect(() => {
    const textarea = textareaRef.current
    if (
      !textarea ||
      !formatRequest ||
      formatRequest.id === handledFormatRef.current
    ) {
      return
    }
    handledFormatRef.current = formatRequest.id
    const result = formattedValue(
      formatRequest.command,
      draft,
      textarea.selectionStart,
      textarea.selectionEnd,
    )
    applyNativeEdit(result)
  }, [draft, formatRequest, onChange])

  return (
    <textarea
      ref={textareaRef}
      className="source-document"
      aria-label="Markdown source"
      autoFocus
      spellCheck={false}
      value={draft}
      onChange={(event) =>
        commit(event.target.value, event.target.selectionStart)
      }
      onKeyDown={(event) => {
        if (
          event.key !== 'Tab' ||
          event.shiftKey ||
          event.nativeEvent.isComposing
        ) {
          return
        }
        event.preventDefault()
        const result = applyInlineFormat(
          draft,
          event.currentTarget.selectionStart,
          event.currentTarget.selectionEnd,
          '  ',
          '',
        )
        applyNativeEdit(result)
      }}
    />
  )
}

function BlockDragHandle({
  index,
  onPointerDown,
  onMove,
}: {
  index: number
  onPointerDown(event: PointerEvent<HTMLButtonElement>): void
  onMove(direction: -1 | 1): void
}) {
  return (
    <button
      type="button"
      className="block-drag-handle"
      aria-label={`Move block ${index + 1}`}
      title="Drag to move block · Alt+Arrow to move"
      onPointerDown={onPointerDown}
      onKeyDown={(event) => {
        if (
          event.altKey &&
          (event.key === 'ArrowUp' || event.key === 'ArrowDown')
        ) {
          event.preventDefault()
          onMove(event.key === 'ArrowUp' ? -1 : 1)
        }
      }}
    >
      <svg viewBox="0 0 12 18" aria-hidden="true">
        {[3, 9].flatMap((x) =>
          [3, 9, 15].map((y) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="1.25" />
          )),
        )}
      </svg>
    </button>
  )
}

function BlockDropZone({
  boundary,
  dragging,
  pointerId,
  active,
  onTarget,
}: {
  boundary: number
  dragging: boolean
  pointerId: number | null
  active: boolean
  onTarget(boundary: number): void
}) {
  return (
    <div
      className={[
        'block-drop-zone',
        dragging ? 'is-dragging' : '',
        active ? 'is-drop-target' : '',
      ].join(' ')}
      data-drop-boundary={boundary}
      aria-hidden="true"
      onPointerEnter={(event) => {
        if (dragging && event.pointerId === pointerId) onTarget(boundary)
      }}
      onPointerUp={(event) => {
        event.preventDefault()
        if (!dragging || event.pointerId !== pointerId) return
        onTarget(boundary)
      }}
    />
  )
}

export function LiveEditor({
  content,
  contentRevision,
  activeBlock,
  formatRequest,
  autoSpacing = false,
  previewAll = false,
  sourceMode = false,
  onPreviewReady,
  onChange,
  onActiveBlockChange,
}: LiveEditorProps) {
  if (
    sourceMode &&
    (typeof contentRevision !== 'number' ||
      !Number.isSafeInteger(contentRevision) ||
      contentRevision < 0)
  ) {
    throw new Error('Source mode requires a document content revision')
  }
  const [insertedBlocks, setInsertedBlocks] = useState<{
    content: string
    blocks: InsertedBlock[]
  }>({ content, blocks: [] })
  const [editingBoundary, setEditingBoundary] =
    useState<EditingBoundary | null>(null)
  const [draggedBlock, setDraggedBlock] = useState<number | null>(null)
  const [dropBoundary, setDropBoundary] = useState<number | null>(null)
  const draggedBlockRef = useRef<number | null>(null)
  const dropBoundaryRef = useRef<number | null>(null)
  const dragPointerRef = useRef<number | null>(null)
  const dragContentRef = useRef<string | null>(null)
  const editorRef = useRef<HTMLElement>(null)
  const currentInsertedBlocks =
    insertedBlocks.content === content ? insertedBlocks.blocks : []
  const model = useMemo(
    () =>
      sourceMode
        ? { blocks: [], renderContext: EMPTY_RENDER_CONTEXT }
        : parseDocument(content),
    [content, sourceMode],
  )
  const parsedEditorBlocks = useMemo(
    () => editorBlocks(content, model.blocks, currentInsertedBlocks),
    [content, currentInsertedBlocks, model.blocks],
  )
  const blocks = useMemo(
    () =>
      preserveEditingBoundary(content, parsedEditorBlocks, editingBoundary),
    [content, editingBoundary, parsedEditorBlocks],
  )
  const renderContext = model.renderContext
  const movableBlocks = useMemo(() => {
    const protectedEnd = frontMatterEnd(content)
    return model.blocks.filter((block) => block.start >= protectedEnd)
  }, [content, model.blocks])
  const realBlockIndexes = useMemo(
    () => new Map(movableBlocks.map((block, index) => [block.id, index])),
    [movableBlocks],
  )
  const safeActive = Math.min(activeBlock, blocks.length - 1)
  const active = blocks[safeActive]
  const [draft, setDraft] = useState(toEditorValue(active.source))
  const [activeSession, setActiveSession] = useState(0)
  const fencedCode = useMemo(() => parseFencedCode(draft), [draft])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const contentRef = useRef(content)
  const rangeRef = useRef<SourceRange>({ start: active.start, end: active.end })
  const composingRef = useRef(false)
  const codeTabEscapeRef = useRef(false)
  const previousActiveRef = useRef(safeActive)
  const previousSourceModeRef = useRef(sourceMode)
  const parentContentRef = useRef(content)
  const pendingAcknowledgementRef = useRef<string | undefined>(undefined)
  const handledFormatRef = useRef(0)
  const activationRef = useRef(onActiveBlockChange)
  activationRef.current = onActiveBlockChange
  const activateBlock = useCallback((index: number) => {
    activationRef.current(index)
  }, [])
  contentRef.current = content

  const rotateEditorSession = () => {
    composingRef.current = false
    codeTabEscapeRef.current = false
    setEditingBoundary(null)
    setActiveSession((session) => session + 1)
  }

  useLayoutEffect(() => {
    const activeChanged = previousActiveRef.current !== safeActive
    const sourceModeChanged = previousSourceModeRef.current !== sourceMode
    const parentChanged = content !== parentContentRef.current
    const acknowledged =
      parentChanged && pendingAcknowledgementRef.current === content
    if (parentChanged) {
      parentContentRef.current = content
      pendingAcknowledgementRef.current = undefined
    }
    if (sourceMode) {
      previousActiveRef.current = safeActive
      previousSourceModeRef.current = true
      return
    }
    const externalChange = parentChanged && !acknowledged
    if (sourceModeChanged || activeChanged || externalChange) {
      const semanticIndex =
        activeChanged && editingBoundary?.content === content
          ? model.blocks.findIndex(
              (block) =>
                block.start <= active.start && block.end >= active.end,
            )
          : -1
      const semanticActive =
        semanticIndex >= 0 ? model.blocks[semanticIndex] : undefined
      const semanticEditorIndex = semanticActive
        ? parsedEditorBlocks.findIndex(
            (block) =>
              block.start === semanticActive.start &&
              block.end === semanticActive.end,
          )
        : -1
      rotateEditorSession()
      setDraft(toEditorValue(semanticActive?.source ?? active.source))
      rangeRef.current = {
        start: semanticActive?.start ?? active.start,
        end: semanticActive?.end ?? active.end,
      }
      if (
        semanticEditorIndex >= 0 &&
        semanticEditorIndex !== safeActive
      ) {
        activationRef.current(semanticEditorIndex)
      }
    }
    if (externalChange) setInsertedBlocks({ content, blocks: [] })
    previousActiveRef.current = safeActive
    previousSourceModeRef.current = false
  }, [
    active.end,
    active.source,
    active.start,
    content,
    editingBoundary,
    model.blocks,
    parsedEditorBlocks,
    safeActive,
    sourceMode,
  ])

  useLayoutEffect(() => {
    resizeTextarea(textareaRef.current)
  }, [draft, safeActive])

  function commitDraft(value: string) {
    const previousContent = contentRef.current
    const previous = { ...rangeRef.current }
    const previousSource = previousContent.slice(previous.start, previous.end)
    const sourceValue = restoreSourceEols(
      value,
      previousSource,
      nearestEol(previousContent, previous.start),
    )
    const nextContent = replaceBlockSource(
      previousContent,
      previous,
      sourceValue,
    )
    const delta = sourceValue.length - (previous.end - previous.start)
    setInsertedBlocks((current) => {
      const existing = current.content === previousContent ? current.blocks : []
      const tracked =
        previous.start === previous.end &&
        !existing.some((block) => block.offset === previous.start)
          ? [
              ...existing,
              {
                offset: previous.start,
                length: 0,
                leftPadding: 0,
                rightPadding: 0,
              },
            ]
          : existing
      return {
        content: nextContent,
        blocks: tracked.map((block) =>
          block.offset === previous.start
            ? { ...block, length: sourceValue.length }
            : block.offset > previous.end
              ? { ...block, offset: block.offset + delta }
              : block,
        ),
      }
    })
    setEditingBoundary({
      content: nextContent,
      start: previous.start,
      end: previous.start + sourceValue.length,
    })
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
    const previousSource = contentRef.current.slice(
      rangeRef.current.start,
      rangeRef.current.end,
    )
    const sourceValue = restoreSourceEols(
      value,
      previousSource,
      nearestEol(contentRef.current, rangeRef.current.start),
    )
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
          sourceOffsetForEditorOffset(sourceValue, selectionStart),
      )
      const transformedEnd = transformTo(
        rangeRef.current.start +
          sourceOffsetForEditorOffset(sourceValue, selectionEnd),
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

    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      draft.length > 0 &&
      textarea.selectionStart === 0 &&
      textarea.selectionEnd === 0
    ) {
      event.preventDefault()
      const insertionPoint = rangeRef.current.start
      const eol = nearestEol(contentRef.current, insertionPoint)
      const insertion = `${eol}${eol}`
      const previousContent = contentRef.current
      const nextContent =
        previousContent.slice(0, insertionPoint) +
        insertion +
        previousContent.slice(insertionPoint)
      setInsertedBlocks((current) => ({
        content: nextContent,
        blocks: [
          ...(current.content === previousContent ? current.blocks : []).map(
            (block) =>
              block.offset >= insertionPoint
                ? { ...block, offset: block.offset + insertion.length }
                : block,
          ),
          {
            offset: insertionPoint,
            length: 0,
            leftPadding: 0,
            rightPadding: insertion.length,
          },
        ],
      }))
      rotateEditorSession()
      setDraft('')
      rangeRef.current = { start: insertionPoint, end: insertionPoint }
      contentRef.current = nextContent
      pendingAcknowledgementRef.current = nextContent
      onChange(nextContent)
      onActiveBlockChange(safeActive)
      afterPaint(() => {
        textareaRef.current?.focus()
        textareaRef.current?.setSelectionRange(0, 0)
      })
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
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
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

    if (
      event.key === 'Backspace' &&
      textarea.selectionStart === 0 &&
      textarea.selectionEnd === 0
    ) {
      const previousContent = contentRef.current
      const blockStart = rangeRef.current.start
      const inserted = (
        insertedBlocks.content === previousContent ? insertedBlocks.blocks : []
      ).find((block) => block.offset === blockStart)
      if (
        inserted &&
        (inserted.leftPadding || inserted.rightPadding) &&
        !draft.trim()
      ) {
        event.preventDefault()
        const removeStart = blockStart - inserted.leftPadding
        const removeEnd =
          blockStart + inserted.length + inserted.rightPadding
        const removedLength =
          inserted.leftPadding + inserted.length + inserted.rightPadding
        const mergedContent =
          previousContent.slice(0, removeStart) +
          previousContent.slice(removeEnd)
        setInsertedBlocks((current) => ({
          content: mergedContent,
          blocks: (current.content === previousContent ? current.blocks : [])
            .filter((block) => block.offset !== blockStart)
            .map((block) =>
              block.offset > blockStart
                ? { ...block, offset: block.offset - removedLength }
                : block,
            ),
        }))
        contentRef.current = mergedContent
        pendingAcknowledgementRef.current = mergedContent
        onChange(mergedContent)
        const targetIndex = Math.max(0, safeActive - 1)
        if (safeActive === 0) {
          const first = parseDocument(mergedContent).blocks[0]
          rotateEditorSession()
          setDraft(toEditorValue(first?.source ?? ''))
          rangeRef.current = {
            start: first?.start ?? 0,
            end: first?.end ?? 0,
          }
        }
        onActiveBlockChange(targetIndex)
        afterPaint(() => {
          const previousStart = blocks[safeActive - 1]?.start ?? 0
          const caret =
            safeActive === 0 ? 0 : Math.max(0, removeStart - previousStart)
          textareaRef.current?.setSelectionRange(caret, caret)
        })
        return
      }
      if (safeActive === 0) return
      event.preventDefault()
      const merged = mergeBlockAtStart(previousContent, blockStart)
      const delta = merged.content.length - previousContent.length
      const previousStart = blocks[safeActive - 1].start
      setInsertedBlocks((current) => ({
        content: merged.content,
        blocks: (current.content === previousContent ? current.blocks : [])
          .filter((block) => block.offset !== blockStart)
          .map((block) =>
            block.offset > blockStart
              ? { ...block, offset: block.offset + delta }
              : block,
          ),
      }))
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
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      textarea.selectionStart === draft.length &&
      textarea.selectionEnd === draft.length
    ) {
      event.preventDefault()
      const insertionPoint = rangeRef.current.end
      const eol = nearestEol(contentRef.current, insertionPoint)
      const insertion = `${eol}${eol}`
      const leftSeparators = separatesParagraphWithOneEol(active.source, eol)
        ? 1
        : 2
      const emptyOffset = insertionPoint + leftSeparators * eol.length
      const nextContent =
        contentRef.current.slice(0, insertionPoint) +
        insertion +
        contentRef.current.slice(insertionPoint)
      const previousContent = contentRef.current
      setInsertedBlocks((current) => ({
        content: nextContent,
        blocks: [
          ...(current.content === previousContent ? current.blocks : []).map(
            (block) =>
              block.offset > insertionPoint
                ? { ...block, offset: block.offset + insertion.length }
                : block,
          ),
          {
            offset: emptyOffset,
            length: 0,
            leftPadding: emptyOffset - insertionPoint,
            rightPadding: 0,
          },
        ].filter(
          (block, index, blocks) =>
            blocks.findIndex((candidate) => candidate.offset === block.offset) ===
            index,
        ),
      }))
      contentRef.current = nextContent
      pendingAcknowledgementRef.current = nextContent
      onChange(nextContent)
      onActiveBlockChange(safeActive + 1)
    }
  }

  const clearDragState = () => {
    draggedBlockRef.current = null
    dropBoundaryRef.current = null
    dragPointerRef.current = null
    dragContentRef.current = null
    setDraggedBlock(null)
    setDropBoundary(null)
  }

  const targetDropBoundary = (boundary: number) => {
    dropBoundaryRef.current = boundary
    setDropBoundary(boundary)
  }

  const moveBlock = (
    fromIndex: number,
    boundary: number,
    focus: 'editor' | 'handle' = 'editor',
  ) => {
    const currentContent = contentRef.current
    const currentModel = parseDocument(currentContent)
    const protectedEnd = frontMatterEnd(currentContent)
    const currentBlocks = currentModel.blocks.filter(
      (block) => block.start >= protectedEnd,
    )
    const reordered = reorderMarkdownBlocks(
      currentContent,
      currentBlocks,
      fromIndex,
      boundary,
    )
    clearDragState()
    if (reordered.content === currentContent) return

    const nextModel = parseDocument(reordered.content)
    const nextProtectedEnd = frontMatterEnd(reordered.content)
    const nextBlocks = nextModel.blocks.filter(
      (block) => block.start >= nextProtectedEnd,
    )
    const moved = nextBlocks[reordered.index]
    const currentInsertions =
      insertedBlocks.content === currentContent ? insertedBlocks.blocks : []
    const reorderedInsertions = reorderInsertedBlocks(
      currentInsertions,
      currentBlocks,
      nextBlocks,
      fromIndex,
      boundary,
    )
    const nextEditorBlocks = editorBlocks(
      reordered.content,
      nextModel.blocks,
      reorderedInsertions,
    )
    const editorIndex = nextEditorBlocks.findIndex(
      (block) => block.start === moved?.start && block.end === moved?.end,
    )
    setInsertedBlocks({
      content: reordered.content,
      blocks: reorderedInsertions,
    })
    if (Math.max(0, editorIndex) === safeActive) rotateEditorSession()
    setDraft(toEditorValue(moved?.source ?? ''))
    rangeRef.current = {
      start: moved?.start ?? 0,
      end: moved?.end ?? 0,
    }
    contentRef.current = reordered.content
    pendingAcknowledgementRef.current = reordered.content
    onChange(reordered.content)
    onActiveBlockChange(Math.max(0, editorIndex))
    afterPaint(() => {
      if (focus === 'handle') {
        editorRef.current
          ?.querySelector<HTMLButtonElement>(
            `[aria-label="Move block ${reordered.index + 1}"]`,
          )
          ?.focus()
      } else {
        textareaRef.current?.focus()
      }
    })
  }

  const finishPointerMove = (pointerId?: number) => {
    if (
      pointerId !== undefined &&
      dragPointerRef.current !== null &&
      pointerId !== dragPointerRef.current
    ) {
      return
    }
    const from = draggedBlockRef.current
    const boundary = dropBoundaryRef.current
    if (
      from !== null &&
      boundary !== null &&
      dragContentRef.current === contentRef.current
    ) {
      moveBlock(from, boundary)
    }
    else clearDragState()
  }

  useEffect(() => {
    if (draggedBlock === null) return undefined
    const track = (event: globalThis.PointerEvent) => {
      if (event.pointerId !== dragPointerRef.current) return
      const zones = Array.from(
        editorRef.current?.querySelectorAll<HTMLElement>('.block-drop-zone') ??
          [],
      )
      const nearest = zones.reduce<{
        boundary: number
        distance: number
      } | null>((closest, zone) => {
        const rect = zone.getBoundingClientRect()
        const distance = Math.abs(event.clientY - (rect.top + rect.height / 2))
        const boundary = Number(zone.dataset.dropBoundary)
        return !closest || distance < closest.distance
          ? { boundary, distance }
          : closest
      }, null)
      if (nearest) targetDropBoundary(nearest.boundary)
    }
    const finish = (event: globalThis.PointerEvent) =>
      finishPointerMove(event.pointerId)
    const cancel = (event: globalThis.PointerEvent) => {
      if (event.pointerId === dragPointerRef.current) clearDragState()
    }
    window.addEventListener('pointermove', track)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointermove', track)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [draggedBlock])

  return (
    <section
      className="editor"
      aria-label="Markdown document"
      ref={editorRef}
      onPointerUp={(event) => finishPointerMove(event.pointerId)}
      onPointerCancel={(event) => {
        if (event.pointerId === dragPointerRef.current) clearDragState()
      }}
    >
      {previewAll ? (
        <FullDocumentPreview content={content} onReady={onPreviewReady} />
      ) : sourceMode ? (
        <DocumentSourceEditor
          content={content}
          contentRevision={contentRevision!}
          formatRequest={formatRequest}
          onChange={onChange}
        />
      ) : (
        <>
          {blocks.map((block, index) => {
            const directRealIndex = realBlockIndexes.get(block.id)
            const containingRealIndex =
              directRealIndex === undefined
                ? movableBlocks.findIndex(
                    (candidate) =>
                      candidate.start === block.start &&
                      candidate.end >= block.end,
                  )
                : -1
            const realIndex =
              directRealIndex ??
              (containingRealIndex >= 0 ? containingRealIndex : undefined)
            return (
              <Fragment
                key={
                  index === safeActive
                    ? `active-block-row-${activeSession}`
                    : block.id
                }
              >
                {realIndex !== undefined && (
                  <BlockDropZone
                    boundary={realIndex}
                    dragging={draggedBlock !== null}
                    pointerId={dragPointerRef.current}
                    active={dropBoundary === realIndex}
                    onTarget={targetDropBoundary}
                  />
                )}
                <div
                  className={
                    index === safeActive
                      ? 'editor-block-row is-active'
                      : 'editor-block-row'
                  }
                >
                  {realIndex !== undefined && (
                    <BlockDragHandle
                      index={realIndex}
                      onPointerDown={(event) => {
                        if (
                          event.button !== 0 ||
                          !event.isPrimary ||
                          dragPointerRef.current !== null
                        ) {
                          return
                        }
                        event.preventDefault()
                        draggedBlockRef.current = realIndex
                        dropBoundaryRef.current = realIndex
                        dragPointerRef.current = event.pointerId
                        dragContentRef.current = contentRef.current
                        setDraggedBlock(realIndex)
                        setDropBoundary(realIndex)
                      }}
                      onMove={(direction) => {
                        if (direction < 0 && realIndex > 0) {
                          moveBlock(realIndex, realIndex - 1, 'handle')
                        }
                        if (
                          direction > 0 &&
                          realIndex < movableBlocks.length - 1
                        ) {
                          moveBlock(realIndex, realIndex + 2, 'handle')
                        }
                      }}
                    />
                  )}
                  {index === safeActive ? (
                    <div className="active-block">
                      <textarea
                        ref={textareaRef}
                        className={
                          fencedCode
                            ? 'source-block source-block-code'
                            : 'source-block'
                        }
                        aria-label={
                          fencedCode
                            ? 'Active code block'
                            : 'Active Markdown block'
                        }
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
                      block={block}
                      context={renderContext}
                      editable
                      index={index}
                      onActivate={activateBlock}
                    />
                  )}
                </div>
              </Fragment>
            )
          })}
          {movableBlocks.length > 0 && (
            <BlockDropZone
              boundary={movableBlocks.length}
              dragging={draggedBlock !== null}
              pointerId={dragPointerRef.current}
              active={dropBoundary === movableBlocks.length}
              onTarget={targetDropBoundary}
            />
          )}
        </>
      )}
      {!previewAll && !sourceMode && (
        <DocumentFootnotes context={renderContext} />
      )}
    </section>
  )
}
