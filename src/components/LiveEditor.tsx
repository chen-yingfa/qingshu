import {
  Fragment,
  memo,
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  normalizeCjkInput,
  protectedMarkdownRanges,
  remapProtectedRanges,
} from '../markdown/cjk'
import type { EditorSelection } from '../hooks/useDocument'
import { highlightCode, parseFencedCode } from '../markdown/code'
import {
  frontMatterEnd,
  hasRenderableMath,
  parseDocument,
  renderDocumentFootnotes,
  renderMarkdown,
  renderMarkdownBlock,
  type DocumentRenderContext,
  type MarkdownBlock,
  type MarkdownDocumentModel,
} from '../markdown/markdown'
import { reorderMarkdownBlocks } from '../markdown/reorder'
import {
  BlockDragHandle as ExtractedBlockDragHandle,
  BlockDropZone as ExtractedBlockDropZone,
} from './BlockDragControls'
import {
  applyInlineFormat,
  DocumentSourceEditor as ExtractedDocumentSourceEditor,
  nearestEol,
  restoreSourceEols,
  sourceOffsetForEditorOffset,
  textReplacement,
  toEditorValue,
  type FormatCommand,
  type FormatRequest,
} from './DocumentSourceEditor'

export type { FormatCommand } from './DocumentSourceEditor'
export {
  applyInlineFormat,
  textReplacement,
} from './DocumentSourceEditor'

interface SourceRange {
  start: number
  end: number
}

interface MathEnterToken {
  revision: number
  value: string
  caret: number
  session: number
}

interface EditorUndoSnapshot {
  content: string
  draft: string
  range: SourceRange
  selection: {
    start: number
    end: number
    direction: SelectionDirection
  }
  activeBlock: number
  mathToken: MathEnterToken | null
  insertedBlocks: {
    content: string
    blocks: InsertedBlock[]
  }
  editingBoundary: EditingBoundary | null
  readonly expectedContent: string
  readonly expectedActiveBlock: number
  readonly expectedDraft: string
}

export interface InsertedBlock {
  offset: number
  length: number
  leftPadding: number
  rightPadding: number
}

export interface EditingBoundary {
  content: string
  start: number
  end: number
}

const EMPTY_RENDER_CONTEXT: DocumentRenderContext = {
  supportSource: '',
  footnoteSource: '',
  references: [],
  signature: '',
  eol: '\n',
}
const EMPTY_DOCUMENT_MODEL: MarkdownDocumentModel = {
  blocks: [],
  renderContext: EMPTY_RENDER_CONTEXT,
  ast: { type: 'root', children: [] },
}


function mappedTransformOffset(
  before: string,
  after: string,
  offset: number,
): number {
  let sourceIndex = 0
  let transformedIndex = 0
  while (sourceIndex < offset && transformedIndex < after.length) {
    if (before[sourceIndex] === after[transformedIndex]) {
      sourceIndex += 1
      transformedIndex += 1
    } else if (
      after[transformedIndex] === ' ' &&
      before[sourceIndex] !== ' '
    ) {
      transformedIndex += 1
    } else {
      // CJK punctuation shortcuts replace one UTF-16 code unit with one.
      sourceIndex += 1
      transformedIndex += 1
    }
  }
  return transformedIndex
}

function separatesParagraphWithOneEol(block: MarkdownBlock) {
  return block.type !== 'paragraph' && block.type !== 'list'
}

interface LiveEditorBaseProps {
  content: string
  activeBlock: number
  formatRequest?: FormatRequest
  autoSpacing?: boolean
  cjkShortcuts?: boolean
  readOnly?: boolean
  previewAll?: boolean
  onPreviewReady?(error?: Error): void
  onChange(content: string): void
  onActiveBlockChange(index: number): void
  selection?: EditorSelection
  onSelectionChange?(selection: EditorSelection): void
  initialEphemeralState?: EditorEphemeralState
  onEphemeralStateChange?(state: EditorEphemeralState): void
}

export interface EditorEphemeralState {
  insertedBlocks: {
    content: string
    blocks: InsertedBlock[]
  }
  editingBoundary: EditingBoundary | null
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

function markImageFailure(target: EventTarget | null): Error | undefined {
  if (!(target instanceof HTMLImageElement)) return undefined
  const label = target.alt || target.currentSrc || target.src || 'image'
  const error = new Error(`Failed to load image "${label}"`)
  target.dataset.imageError = 'true'
  target.title = error.message
  return error
}

function ActiveBlockPreview({ source }: { source: string }) {
  const code = useMemo(() => parseFencedCode(source), [source])
  const model = useMemo(
    () => (code || !source.includes('$') ? undefined : parseDocument(source)),
    [code, source],
  )
  const containsMath = model ? hasRenderableMath(source, model) : false
  const [mathHtml, setMathHtml] = useState('')
  const [codeHtml, setCodeHtml] = useState('')

  useEffect(() => {
    let current = true
    const timer = window.setTimeout(() => {
      if (code) {
        setMathHtml('')
        setCodeHtml(highlightCode(code.code, code.language))
      } else if (containsMath) {
        setCodeHtml('')
        void renderMarkdown(source, model).then(
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
  }, [code, containsMath, model, source])

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

  if (!containsMath || !mathHtml) return null
  return (
    <div className="active-live-preview active-math-preview" aria-label="Live math preview">
      <div className="preview-label">Math · live preview</div>
      <div
        className="rendered-block"
        onError={(event) => markImageFailure(event.target)}
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
        onError={(event) => {
          const error = markImageFailure(event.target)
          if (error) onReady?.(error)
        }}
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
  const [error, setError] = useState<Error | null>(null)
  const isFrontmatter = block.type === 'yaml' || block.type === 'toml'

  useEffect(() => {
    if (isFrontmatter) {
      setHtml('')
      setError(null)
      return undefined
    }
    let current = true
    const cancel = deferWork(() => {
      void renderMarkdownBlock(block, context).then(
        (rendered) => {
          if (current) {
            setHtml(rendered)
            setError(null)
          }
        },
        (reason: unknown) => {
          if (current) {
            setError(reason instanceof Error ? reason : new Error(String(reason)))
          }
        },
      )
    })
    return () => {
      current = false
      cancel()
    }
  }, [block, context, isFrontmatter])

  const activateFromPreview = (event: MouseEvent<HTMLElement>) => {
    if (
      editable &&
      !(event.target as HTMLElement).closest(
        'a, button, input, select, textarea, summary',
      )
    ) {
      onActivate(index)
    }
  }

  return (
    <div className="preview-block" data-block-id={block.id}>
      {isFrontmatter ? (
        <div
          className="rendered-block frontmatter-preview"
          onClick={activateFromPreview}
        >
          <div className="frontmatter-preview-label">
            {block.type === 'yaml' ? 'YAML' : 'TOML'} front matter
          </div>
          <pre>{block.source}</pre>
        </div>
      ) : (
        <div
          className="rendered-block"
          onError={(event) => markImageFailure(event.target)}
          onClick={activateFromPreview}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
      {error && (
        <div className="block-render-error" role="alert">
          Unable to render this block: {error.message}
        </div>
      )}
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

export function LiveEditor({
  content,
  contentRevision,
  activeBlock,
  formatRequest,
  autoSpacing = false,
  cjkShortcuts = true,
  readOnly = false,
  previewAll = false,
  sourceMode = false,
  onPreviewReady,
  onChange,
  onActiveBlockChange,
  selection,
  onSelectionChange,
  initialEphemeralState,
  onEphemeralStateChange,
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
  }>(initialEphemeralState?.insertedBlocks ?? { content, blocks: [] })
  const [editingBoundary, setEditingBoundary] =
    useState<EditingBoundary | null>(
      initialEphemeralState?.editingBoundary ?? null,
    )
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
        ? EMPTY_DOCUMENT_MODEL
        : parseDocument(content),
    [content, sourceMode],
  )
  const protectedRanges = useMemo(
    () => sourceMode ? [] : protectedMarkdownRanges(content, model.ast),
    [content, model.ast, sourceMode],
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
  const [activeInputFocused, setActiveInputFocused] = useState(false)
  const [activeSession, setActiveSession] = useState(0)
  const fencedCode = useMemo(() => parseFencedCode(draft), [draft])
  const displayMath = useMemo(
    () => draft.startsWith('$$\n') && draft.endsWith('\n$$'),
    [draft],
  )
  const activeFrontmatter =
    active.type === 'yaml' || active.type === 'toml'
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const contentRef = useRef(content)
  const rangeRef = useRef<SourceRange>({ start: active.start, end: active.end })
  const composingRef = useRef(false)
  const codeTabEscapeRef = useRef(false)
  const mathEnterTokenRef = useRef<MathEnterToken | null>(null)
  const draftRevisionRef = useRef(0)
  const editorSessionRef = useRef(0)
  const interactionGenerationRef = useRef(0)
  const editorUndoRef = useRef<EditorUndoSnapshot[]>([])
  const pendingUndoRestoreRef = useRef<EditorUndoSnapshot | null>(null)
  const insertedBlocksRef = useRef(insertedBlocks)
  const editingBoundaryRef = useRef(editingBoundary)
  const selectionRef = useRef({
    start: 0,
    end: 0,
    direction: 'none' as SelectionDirection,
  })
  const deferredSelectionRef = useRef<{ start: number; end: number } | null>(
    null,
  )
  const previousActiveRef = useRef(safeActive)
  const previousSourceModeRef = useRef(sourceMode)
  const previousDisplayModeRef = useRef({ sourceMode, previewAll })
  const parentContentRef = useRef(content)
  const pendingAcknowledgementRef = useRef<string | undefined>(undefined)
  const handledFormatRef = useRef(0)
  const activationRef = useRef(onActiveBlockChange)
  activationRef.current = onActiveBlockChange
  const activateBlock = useCallback((index: number) => {
    activationRef.current(index)
  }, [])
  insertedBlocksRef.current = insertedBlocks
  editingBoundaryRef.current = editingBoundary

  const invalidateMathInteraction = () => {
    interactionGenerationRef.current += 1
    mathEnterTokenRef.current = null
    deferredSelectionRef.current = null
  }

  const setEditorSelection = (
    textarea: HTMLTextAreaElement,
    start: number,
    end = start,
    direction: SelectionDirection = 'none',
  ) => {
    selectionRef.current = { start, end, direction }
    textarea.setSelectionRange(start, end, direction)
    if (
      deferredSelectionRef.current?.start === start &&
      deferredSelectionRef.current.end === end
    ) {
      deferredSelectionRef.current = null
    }
  }

  const afterInteractionPaint = (
    textarea: HTMLTextAreaElement,
    callback: () => void,
  ) => {
    const generation = interactionGenerationRef.current
    afterPaint(() => {
      if (
        interactionGenerationRef.current !== generation ||
        textareaRef.current !== textarea ||
        document.activeElement !== textarea
      ) {
        return
      }
      callback()
    })
  }

  useEffect(() => {
    onEphemeralStateChange?.({ insertedBlocks, editingBoundary })
  }, [
    editingBoundary,
    insertedBlocks,
    onEphemeralStateChange,
  ])

  const rotateEditorSession = () => {
    composingRef.current = false
    codeTabEscapeRef.current = false
    invalidateMathInteraction()
    draftRevisionRef.current += 1
    editorSessionRef.current += 1
    setActiveInputFocused(document.activeElement === textareaRef.current)
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
      contentRef.current = content
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
    const snapshot = pendingUndoRestoreRef.current
    if (!snapshot || safeActive !== snapshot.activeBlock) return
    const textarea = textareaRef.current
    if (!textarea) return
    contentRef.current = snapshot.content
    rangeRef.current = { ...snapshot.range }
    insertedBlocksRef.current = snapshot.insertedBlocks
    editingBoundaryRef.current = snapshot.editingBoundary
    setInsertedBlocks(snapshot.insertedBlocks)
    setEditingBoundary(snapshot.editingBoundary)
    setDraft(snapshot.draft)
    mathEnterTokenRef.current = null
    deferredSelectionRef.current = {
      start: snapshot.selection.start,
      end: snapshot.selection.end,
    }
    textarea.focus()
    selectionRef.current = { ...snapshot.selection }
    textarea.setSelectionRange(
      snapshot.selection.start,
      snapshot.selection.end,
      snapshot.selection.direction,
    )
    mathEnterTokenRef.current = snapshot.mathToken
      ? {
          ...snapshot.mathToken,
          revision: draftRevisionRef.current,
          session: editorSessionRef.current,
        }
      : null
    const generation = interactionGenerationRef.current
    afterPaint(() => {
      if (pendingUndoRestoreRef.current !== snapshot) return
      const current = textareaRef.current
      if (current !== textarea) return
      if (
        interactionGenerationRef.current !== generation ||
        document.activeElement !== textarea
      ) {
        pendingUndoRestoreRef.current = null
        deferredSelectionRef.current = null
        return
      }
      selectionRef.current = {
        ...snapshot.selection,
      }
      current.setSelectionRange(
        snapshot.selection.start,
        snapshot.selection.end,
        snapshot.selection.direction,
      )
      deferredSelectionRef.current = null
      mathEnterTokenRef.current = snapshot.mathToken
        ? {
            ...snapshot.mathToken,
            revision: draftRevisionRef.current,
            session: editorSessionRef.current,
          }
        : null
      pendingUndoRestoreRef.current = null
    })
  }, [activeSession, content, draft, safeActive])

  useLayoutEffect(() => {
    const previous = previousDisplayModeRef.current
    if (
      previous.sourceMode !== sourceMode ||
      previous.previewAll !== previewAll
    ) {
      invalidateMathInteraction()
      setActiveInputFocused(document.activeElement === textareaRef.current)
      previousDisplayModeRef.current = { sourceMode, previewAll }
    }
  }, [previewAll, sourceMode])

  useLayoutEffect(() => {
    resizeTextarea(textareaRef.current)
  }, [draft, safeActive])

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea || sourceMode || !selection) return
    const start = Math.min(selection.start, textarea.value.length)
    const end = Math.min(selection.end, textarea.value.length)
    if (
      textarea.selectionStart !== start ||
      textarea.selectionEnd !== end ||
      textarea.selectionDirection !== selection.direction
    ) {
      invalidateMathInteraction()
      setEditorSelection(textarea, start, end, selection.direction)
    }
  }, [activeSession, selection, sourceMode])

  const reportSelection = (textarea: HTMLTextAreaElement) => {
    selectionRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      direction: textarea.selectionDirection ?? 'none',
    }
    onSelectionChange?.({
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      direction: textarea.selectionDirection ?? 'none',
    })
  }

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
    draftRevisionRef.current += 1
    rangeRef.current.end = rangeRef.current.start + sourceValue.length
    contentRef.current = nextContent
    pendingAcknowledgementRef.current = nextContent
    onChange(nextContent)
  }

  const snapshotForDraft = (
    value: string,
    selection: EditorUndoSnapshot['selection'],
  ): EditorUndoSnapshot => {
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
    const existing =
      insertedBlocksRef.current.content === previousContent
        ? insertedBlocksRef.current.blocks
        : []
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
    const nextInserted = {
      content: nextContent,
      blocks: tracked.map((block) =>
        block.offset === previous.start
          ? { ...block, length: sourceValue.length }
          : block.offset > previous.end
            ? { ...block, offset: block.offset + delta }
            : { ...block },
      ),
    }
    return {
      content: nextContent,
      draft: value,
      range: {
        start: previous.start,
        end: previous.start + sourceValue.length,
      },
      selection,
      activeBlock: safeActive,
      mathToken: mathEnterTokenRef.current
        ? { ...mathEnterTokenRef.current }
        : null,
      insertedBlocks: nextInserted,
      editingBoundary: {
        content: nextContent,
        start: previous.start,
        end: previous.start + sourceValue.length,
      },
      expectedContent: '',
      expectedActiveBlock: safeActive,
      expectedDraft: '',
    }
  }

  const currentUndoSnapshot = (): EditorUndoSnapshot => {
    const textarea = textareaRef.current
    return {
      content: contentRef.current,
      draft,
      range: { ...rangeRef.current },
      selection: textarea
        ? {
            start: textarea.selectionStart,
            end: textarea.selectionEnd,
            direction: textarea.selectionDirection ?? 'none',
          }
        : { ...selectionRef.current },
      activeBlock: safeActive,
      mathToken: mathEnterTokenRef.current
        ? { ...mathEnterTokenRef.current }
        : null,
      insertedBlocks: {
        content: insertedBlocksRef.current.content,
        blocks: insertedBlocksRef.current.blocks.map((block) => ({ ...block })),
      },
      editingBoundary: editingBoundaryRef.current
        ? { ...editingBoundaryRef.current }
        : null,
      expectedContent: '',
      expectedActiveBlock: safeActive,
      expectedDraft: '',
    }
  }

  const pushEditorUndo = (
    snapshot: EditorUndoSnapshot,
    expectedContent: string,
    expectedActiveBlock = safeActive,
    expectedDraft = draft,
  ) => {
    editorUndoRef.current = [
      ...editorUndoRef.current,
      { ...snapshot, expectedContent, expectedActiveBlock, expectedDraft },
    ].slice(-32)
  }

  const restoreEditorUndo = (): boolean => {
    const snapshot = editorUndoRef.current.at(-1)
    if (
      !snapshot ||
      snapshot.expectedActiveBlock !== safeActive ||
      snapshot.expectedContent !== contentRef.current ||
      snapshot.expectedDraft !== draft
    ) {
      return false
    }
    editorUndoRef.current = editorUndoRef.current.slice(0, -1)
    invalidateMathInteraction()
    pendingUndoRestoreRef.current = snapshot
    insertedBlocksRef.current = snapshot.insertedBlocks
    editingBoundaryRef.current = snapshot.editingBoundary
    setInsertedBlocks(snapshot.insertedBlocks)
    setEditingBoundary(snapshot.editingBoundary)
    setDraft(snapshot.draft)
    rangeRef.current = { ...snapshot.range }
    contentRef.current = snapshot.content
    pendingAcknowledgementRef.current = snapshot.content
    onChange(snapshot.content)
    onActiveBlockChange(snapshot.activeBlock)
    return true
  }

  const applyControlledTextareaEdit = (
    before: string,
    value: string,
    selectionStart: number,
    selectionEnd = selectionStart,
    afterCommit?: () => void,
    undoSnapshot?: EditorUndoSnapshot,
  ) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const change = textReplacement(before, value)
    setEditorSelection(textarea, change.start, change.end)
    textarea.setRangeText(
      change.replacement,
      change.start,
      change.end,
      'preserve',
    )
    setEditorSelection(textarea, selectionStart, selectionEnd)
    commitDraft(textarea.value)
    if (undoSnapshot) {
      pushEditorUndo(undoSnapshot, contentRef.current, safeActive, value)
    }
    afterCommit?.()
    deferredSelectionRef.current = {
      start: selectionStart,
      end: selectionEnd,
    }
    afterInteractionPaint(textarea, () => {
      setEditorSelection(textarea, selectionStart, selectionEnd)
    })
  }

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea || !formatRequest || formatRequest.id === handledFormatRef.current) return
    if (readOnly) return
    invalidateMathInteraction()
    handledFormatRef.current = formatRequest.id
    const result = formattedValue(
      formatRequest.command,
      draft,
      textarea.selectionStart,
      textarea.selectionEnd,
    )
    commitDraft(result.value)
    afterInteractionPaint(textarea, () => {
      setEditorSelection(textarea, result.selectionStart, result.selectionEnd)
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
    const editableRange = {
      start: 0,
      end: sourceValue.length,
    }
    const localProtectedRanges = remapProtectedRanges(
      active.source,
      sourceValue,
      protectedRanges
        .filter(
          range =>
            range.start < active.end &&
            range.end > active.start,
        )
        .map(range => ({
          start: Math.max(0, range.start - active.start),
          end: Math.min(active.source.length, range.end - active.start),
        })),
    )
    const transformedSource = normalizeCjkInput(
      sourceValue,
      editableRange,
      autoSpacing,
      localProtectedRanges,
      cjkShortcuts,
    )
    const transformedEnd = mappedTransformOffset(
      sourceValue,
      transformedSource,
      editableRange.end,
    )
    const normalized = toEditorValue(
      transformedSource.slice(editableRange.start, transformedEnd),
    )
    if (normalized !== value) {
      const sourceSelectionStart =
        sourceOffsetForEditorOffset(sourceValue, selectionStart)
      const sourceSelectionEnd =
        sourceOffsetForEditorOffset(sourceValue, selectionEnd)
      const transformedStart = mappedTransformOffset(
        sourceValue,
        transformedSource,
        sourceSelectionStart,
      )
      const transformedSelectionEnd = mappedTransformOffset(
        sourceValue,
        transformedSource,
        sourceSelectionEnd,
      )
      const nextStart = toEditorValue(
        transformedSource.slice(editableRange.start, transformedStart),
      ).length
      const nextEnd = toEditorValue(
        transformedSource.slice(
          editableRange.start,
          transformedSelectionEnd,
        ),
      ).length
      commitDraft(normalized)
      const textarea = textareaRef.current
      if (textarea) {
        deferredSelectionRef.current = { start: nextStart, end: nextEnd }
        afterInteractionPaint(textarea, () => {
          setEditorSelection(textarea, nextStart, nextEnd)
        })
      }
    }
  }

  const insertBlockAfter = (separationBlock: MarkdownBlock = active) => {
    const insertionPoint = rangeRef.current.end
    const eol = nearestEol(contentRef.current, insertionPoint)
    const insertion = `${eol}${eol}`
    const leftSeparators = separatesParagraphWithOneEol(separationBlock)
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

  const exitMathBlock = (
    cleaned: string,
    snapshot: EditorUndoSnapshot,
  ) => {
    const previousContent = contentRef.current
    const previousRange = { ...rangeRef.current }
    const previousSource = previousContent.slice(
      previousRange.start,
      previousRange.end,
    )
    const cleanedSource = restoreSourceEols(
      cleaned,
      previousSource,
      nearestEol(previousContent, previousRange.start),
    )
    const replaced = replaceBlockSource(
      previousContent,
      previousRange,
      cleanedSource,
    )
    const cleanedEnd = previousRange.start + cleanedSource.length
    const eol = nearestEol(replaced, cleanedEnd)
    const insertion = replaced.startsWith(`${eol}${eol}`, cleanedEnd)
      ? eol
      : `${eol}${eol}`
    const nextContent =
      replaced.slice(0, cleanedEnd) + insertion + replaced.slice(cleanedEnd)
    const cleanupDelta =
      cleanedSource.length - (previousRange.end - previousRange.start)
    const existing =
      insertedBlocksRef.current.content === previousContent
        ? insertedBlocksRef.current.blocks
        : []
    const cleanedBlocks = existing.map((block) =>
      block.offset === previousRange.start
        ? { ...block, length: cleanedSource.length }
        : block.offset > previousRange.end
          ? { ...block, offset: block.offset + cleanupDelta }
          : { ...block },
    )
    const leftSeparators = separatesParagraphWithOneEol({
      ...active,
      type: 'math',
      source: cleanedSource,
      end: cleanedEnd,
    })
      ? 1
      : 2
    const emptyOffset = cleanedEnd + leftSeparators * eol.length
    const nextInserted = {
      content: nextContent,
      blocks: [
        ...cleanedBlocks.map((block) =>
          block.offset > cleanedEnd
            ? { ...block, offset: block.offset + insertion.length }
            : block,
        ),
        {
          offset: emptyOffset,
          length: 0,
          leftPadding: emptyOffset - cleanedEnd,
          rightPadding: 0,
        },
      ].filter(
        (block, index, blocks) =>
          blocks.findIndex((candidate) => candidate.offset === block.offset) ===
          index,
      ),
    }
    invalidateMathInteraction()
    draftRevisionRef.current += 1
    setDraft(cleaned)
    rangeRef.current = { start: previousRange.start, end: cleanedEnd }
    insertedBlocksRef.current = nextInserted
    editingBoundaryRef.current = null
    setInsertedBlocks(nextInserted)
    setEditingBoundary(null)
    contentRef.current = nextContent
    pendingAcknowledgementRef.current = nextContent
    pushEditorUndo(snapshot, nextContent, safeActive + 1, '')
    onChange(nextContent)
    onActiveBlockChange(safeActive + 1)
  }

  const enterDisplayMathMode = (value: string): boolean => {
    const isDollar = value === '$$'
    const isYen =
      cjkShortcuts && (value === '¥¥' || value === '￥￥')
    if (!isDollar && !isYen) return false
    const mathSource = '$$\n\n$$'
    invalidateMathInteraction()
    const undoSnapshot = snapshotForDraft(value, {
      start: value.length,
      end: value.length,
      direction: 'none',
    })
    applyControlledTextareaEdit(value, mathSource, 3, 3, undefined, undoSnapshot)
    return true
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (readOnly) return
    if (
      event.key === 'Process' ||
      event.nativeEvent.isComposing ||
      composingRef.current
    ) return
    const textarea = event.currentTarget
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === 'z'
    ) {
      invalidateMathInteraction()
      if (restoreEditorUndo()) {
        event.preventDefault()
      }
      return
    }
    const unmodifiedEnter =
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey
    if (
      [
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Home',
        'End',
        'PageUp',
        'PageDown',
      ].includes(event.key)
    ) {
      invalidateMathInteraction()
    }
    if (!unmodifiedEnter) invalidateMathInteraction()

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

    if (
      fencedCode &&
      event.key === 'Tab' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
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
      displayMath &&
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey
    ) {
      event.preventDefault()
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const token = mathEnterTokenRef.current
      const canExit =
        token !== null &&
        token.revision === draftRevisionRef.current &&
        token.session === editorSessionRef.current &&
        token.value === draft &&
        token.caret === start &&
        start === end &&
        draft[start - 1] === '\n'
      if (canExit) {
        const cleaned = draft.slice(0, start - 1) + draft.slice(start)
        const snapshot = currentUndoSnapshot()
        exitMathBlock(cleaned, snapshot)
        return
      }

      const nextDraft = draft.slice(0, start) + '\n' + draft.slice(end)
      const caret = start + 1
      invalidateMathInteraction()
      const undoSnapshot = currentUndoSnapshot()
      applyControlledTextareaEdit(
        draft,
        nextDraft,
        caret,
        caret,
        () => {
          mathEnterTokenRef.current = {
            revision: draftRevisionRef.current,
            value: nextDraft,
            caret,
            session: editorSessionRef.current,
          }
        },
        undoSnapshot,
      )
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
          const first = blocks.find((_block, index) => index !== safeActive)
          rotateEditorSession()
          setDraft(toEditorValue(first?.source ?? ''))
          rangeRef.current = {
            start: Math.max(0, (first?.start ?? removedLength) - removedLength),
            end: Math.max(0, (first?.end ?? removedLength) - removedLength),
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
      insertBlockAfter()
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
    if (readOnly) return
    const currentContent = contentRef.current
    const currentBlocks =
      currentContent === content
        ? movableBlocks
        : parseDocument(currentContent).blocks.filter(
            (block) => block.start >= frontMatterEnd(currentContent),
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
        <ExtractedDocumentSourceEditor
          content={content}
          contentRevision={contentRevision!}
          formatRequest={formatRequest}
          autoSpacing={autoSpacing}
          cjkShortcuts={cjkShortcuts}
          readOnly={readOnly}
          onChange={onChange}
          selection={selection}
          onSelectionChange={onSelectionChange}
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
                  <ExtractedBlockDropZone
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
                    <ExtractedBlockDragHandle
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
                            : displayMath
                              ? 'source-block source-block-math'
                              : activeFrontmatter
                                ? 'source-block source-block-frontmatter'
                            : 'source-block'
                        }
                        aria-label={
                          fencedCode
                            ? 'Active code block'
                            : displayMath
                              ? 'Active math block'
                              : activeFrontmatter
                                ? `Active ${active.type.toUpperCase()} front matter block`
                            : 'Active Markdown block'
                        }
                        autoFocus
                        spellCheck={
                          !fencedCode && !displayMath && !activeFrontmatter
                        }
                        readOnly={readOnly}
                        value={draft}
                        onFocus={() => setActiveInputFocused(true)}
                        onChange={(event) => {
                          if (readOnly) return
                          const textarea = event.currentTarget
                          const inputType = (event.nativeEvent as InputEvent)
                            .inputType
                          const historyInput =
                            inputType === 'historyUndo' ||
                            inputType === 'historyRedo'
                          if (
                            !historyInput &&
                            !composingRef.current &&
                            enterDisplayMathMode(textarea.value)
                          ) {
                            return
                          }
                          invalidateMathInteraction()
                          commitDraft(textarea.value)
                          reportSelection(textarea)
                          if (!composingRef.current && autoSpacing) {
                            normalize(
                              textarea.value,
                              textarea.selectionStart,
                              textarea.selectionEnd,
                            )
                          }
                        }}
                        onSelect={(event) => {
                          const textarea = event.currentTarget
                          const deferred = deferredSelectionRef.current
                          const token = mathEnterTokenRef.current
                          if (deferred) {
                            if (
                              token &&
                              (textarea.selectionStart !== token.caret ||
                                textarea.selectionEnd !== token.caret)
                            ) {
                              deferredSelectionRef.current = null
                              invalidateMathInteraction()
                              reportSelection(textarea)
                            }
                            return
                          }
                          deferredSelectionRef.current = null
                          if (
                            textarea.selectionStart !== selectionRef.current.start ||
                            textarea.selectionEnd !== selectionRef.current.end ||
                            textarea.selectionDirection !==
                              selectionRef.current.direction
                          ) {
                            invalidateMathInteraction()
                          }
                          reportSelection(textarea)
                        }}
                        onPointerDown={() => {
                          invalidateMathInteraction()
                        }}
                        onBlur={(event) => {
                          invalidateMathInteraction()
                          setActiveInputFocused(false)
                          composingRef.current = false
                          codeTabEscapeRef.current = false
                          normalize(
                            event.currentTarget.value,
                            event.currentTarget.selectionStart,
                            event.currentTarget.selectionEnd,
                          )
                        }}
                        onCompositionStart={() => {
                          invalidateMathInteraction()
                          composingRef.current = true
                        }}
                        onCompositionEnd={(event) => {
                          composingRef.current = false
                          invalidateMathInteraction()
                          if (enterDisplayMathMode(event.currentTarget.value)) {
                            return
                          }
                          normalize(
                            event.currentTarget.value,
                            event.currentTarget.selectionStart,
                            event.currentTarget.selectionEnd,
                          )
                        }}
                        onKeyDown={handleKeyDown}
                      />
                      {activeInputFocused && (
                        <ActiveBlockPreview source={draft} />
                      )}
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
            <ExtractedBlockDropZone
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
