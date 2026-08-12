import {
  Fragment,
  memo,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
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
  markdownListItemRenderKey,
  renderMarkdownListItem,
  type DocumentRenderContext,
  type MarkdownBlock,
  type MarkdownDocumentModel,
  type RenderedListGroup,
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
import {
  createMarkerProjection,
  type MarkerProjectionMode,
  type VisibleEdit,
} from './markerProjection'

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

interface SyntheticListSeparator {
  readonly editorLifetime: object
  readonly originatingBlock: object
  readonly session: number
  offset: number
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
  syntheticListSeparators: SyntheticListSeparator[]
  readonly expectedContent: string
  expectedActiveBlock: number
  expectedDraft: string
  expectedBlockId?: string
  expectedSession: number
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
  retainOnActivation?: boolean
}

const EMPTY_RENDER_CONTEXT: DocumentRenderContext = {
  source: '',
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

interface ListLine {
  start: number
  end: number
  prefixEnd: number
  indent: string
  marker: string
  nextPrefix: string
  content: string
}

function parseListLine(
  value: string,
  start: number,
  end: number,
  firstLineIndent = '',
): ListLine | null {
  const line = value.slice(start, end)
  const unordered = line.match(/^([ \t]*)([-+*])[ \t]+(.*)$/u)
  if (unordered) {
    const sourceIndent = start === 0 ? firstLineIndent : ''
    const task = unordered[3].match(/^\[[ xX]\][ \t]+(.*)$/u)
    const content = task?.[1] ?? unordered[3]
    const prefixLength = line.length - content.length
    return {
      start,
      end,
      prefixEnd: start + prefixLength,
      indent: unordered[1],
      marker: unordered[2],
      nextPrefix: task
        ? `${sourceIndent}${unordered[1]}${unordered[2]} [ ] `
        : `${sourceIndent}${unordered[1]}${unordered[2]} `,
      content,
    }
  }
  const ordered = line.match(/^([ \t]*)(\d+)([.)])[ \t]+(.*)$/u)
  if (!ordered) return null
  const sourceIndent = start === 0 ? firstLineIndent : ''
  const prefixLength = line.length - ordered[4].length
  const incremented = Number(ordered[2]) + 1
  const nextNumber = String(
    incremented > 999_999_999 ? 1 : incremented,
  ).padStart(incremented > 999_999_999 ? 1 : ordered[2].length, '0')
  return {
    start,
    end,
    prefixEnd: start + prefixLength,
    indent: ordered[1],
    marker: `${ordered[2]}${ordered[3]}`,
    nextPrefix: `${sourceIndent}${ordered[1]}${nextNumber}${ordered[3]} `,
    content: ordered[4],
  }
}

function listItemStarts(value: string): Set<number> {
  const starts = new Set<number>()
  const visit = (node: MarkdownDocumentModel['ast']) => {
    if (node.type === 'listItem') {
      const start = node.position?.start.offset
      if (start !== undefined) starts.add(start)
    }
    node.children?.forEach((child) => visit(child as MarkdownDocumentModel['ast']))
  }
  visit(parseDocument(value).ast)
  return starts
}

function selectionIsInNonListMarkdown(
  value: string,
  start: number,
  end: number,
): boolean {
  const excludedTypes = new Set([
    'code',
    'html',
    'inlineCode',
    'inlineMath',
    'math',
    'toml',
    'yaml',
  ])
  let excluded = false
  const visit = (node: MarkdownDocumentModel['ast']) => {
    const nodeStart = node.position?.start.offset
    const nodeEnd = node.position?.end.offset
    if (
      excludedTypes.has(node.type) &&
      nodeStart !== undefined &&
      nodeEnd !== undefined &&
      nodeStart <= start &&
      nodeEnd >= end
    ) {
      excluded = true
      return
    }
    node.children?.forEach((child) => visit(child as MarkdownDocumentModel['ast']))
  }
  visit(parseDocument(value).ast)
  return excluded
}

function listLineAt(
  value: string,
  caret: number,
  firstLineIndent = '',
): ListLine | null {
  const start = value.lastIndexOf('\n', Math.max(0, caret - 1)) + 1
  const nextBreak = value.indexOf('\n', caret)
  const end = nextBreak < 0 ? value.length : nextBreak
  const line = parseListLine(value, start, end, firstLineIndent)
  if (!line) return null
  const starts = listItemStarts(value)
  return starts.has(start) ||
    starts.has(start + line.indent.length) ||
    !line.content.trim()
    ? line
    : null
}

interface ListItemRange extends ListLine {
  itemEnd: number
  logicalIndent: number
}

function listItemRanges(
  value: string,
  firstLineIndent: string,
): ListItemRange[] {
  const semanticStarts = listItemStarts(value)
  const lines: ListLine[] = []
  let start = 0
  while (start <= value.length) {
    const nextBreak = value.indexOf('\n', start)
    const end = nextBreak < 0 ? value.length : nextBreak
    const line = parseListLine(value, start, end, firstLineIndent)
    if (
      line &&
      (semanticStarts.has(start) ||
        semanticStarts.has(start + line.indent.length) ||
        !line.content.trim())
    ) {
      lines.push(line)
    }
    if (nextBreak < 0) break
    start = nextBreak + 1
  }
  return lines.map((line, index) => {
    const logicalIndent =
      line.indent.length + (line.start === 0 ? firstLineIndent.length : 0)
    const nextSibling = lines
      .slice(index + 1)
      .find(
        (candidate) =>
          candidate.indent.length +
            (candidate.start === 0 ? firstLineIndent.length : 0) <=
          logicalIndent,
      )
    return {
      ...line,
      logicalIndent,
      itemEnd: nextSibling?.start ?? value.length,
    }
  })
}

function selectedListItemRange(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  firstLineIndent: string,
): { start: number; end: number } | null {
  const items = listItemRanges(value, firstLineIndent)
  const itemAt = (position: number) =>
    items
      .filter((item) => item.start <= position && position < item.itemEnd)
      .sort(
        (left, right) =>
          right.logicalIndent - left.logicalIndent ||
          right.start - left.start,
      )[0]
  const first = itemAt(selectionStart)
  if (!first) return null
  if (selectionStart === selectionEnd) {
    return { start: first.start, end: first.itemEnd }
  }
  const last = itemAt(Math.max(selectionStart, selectionEnd - 1)) ?? first
  const rootIndent = Math.min(first.logicalIndent, last.logicalIndent)
  const selected = items.filter(
    (item) =>
      item.logicalIndent === rootIndent &&
      item.itemEnd > selectionStart &&
      item.start < selectionEnd,
  )
  if (selected.length === 0) return null
  return {
    start: selected[0].start,
    end: selected.at(-1)!.itemEnd,
  }
}

function listParent(
  items: ListItemRange[],
  item: ListItemRange,
): ListItemRange | undefined {
  return items
    .filter(
      (candidate) =>
        candidate.start < item.start &&
        candidate.logicalIndent < item.logicalIndent &&
        candidate.itemEnd >= item.itemEnd,
    )
    .sort((left, right) => right.logicalIndent - left.logicalIndent)[0]
}

function listIndentUnitForParent(
  items: ListItemRange[],
  parent: ListItemRange,
): string {
  const existingChild = items
    .filter(
      (candidate) =>
        candidate.start > parent.start &&
        candidate.start < parent.itemEnd &&
        candidate.logicalIndent > parent.logicalIndent,
    )
    .sort(
      (left, right) =>
        left.logicalIndent - right.logicalIndent || left.start - right.start,
    )[0]
  if (existingChild) {
    if (existingChild.indent.includes('\t')) return '\t'
    return ' '.repeat(existingChild.logicalIndent - parent.logicalIndent)
  }
  return ' '.repeat(parent.marker.length + 1)
}

function listOutdentWidth(
  items: ListItemRange[],
  item: ListItemRange,
  sourcePrefix = '',
): number {
  const parent = listParent(items, item)
  if (parent) return item.logicalIndent - parent.logicalIndent
  return item.start === 0 ? sourcePrefix.length : 0
}

interface TextIndentEdit {
  start: number
  remove: number
  insert: string
}

function mapSelectionOffset(offset: number, edits: TextIndentEdit[]): number {
  let mapped = offset
  for (const edit of [...edits].sort((left, right) => left.start - right.start)) {
    if (offset < edit.start) continue
    if (offset < edit.start + edit.remove) {
      mapped = edit.start + edit.insert.length
      continue
    }
    mapped += edit.insert.length - edit.remove
  }
  return mapped
}

function applyTextIndentEdits(
  value: string,
  edits: TextIndentEdit[],
): string {
  let result = value
  for (const edit of [...edits].sort((left, right) => right.start - left.start)) {
    result =
      result.slice(0, edit.start) +
      edit.insert +
      result.slice(edit.start + edit.remove)
  }
  return result
}

function textOutdentEdits(
  value: string,
  start: number,
  end: number,
  width: number,
  skipFirstLine: boolean,
): TextIndentEdit[] | null {
  if (width <= 0) return []
  const edits: TextIndentEdit[] = []
  let lineStart = start
  while (lineStart < end) {
    const nextBreak = value.indexOf('\n', lineStart)
    const lineEnd = nextBreak < 0 ? value.length : nextBreak
    const line = value.slice(lineStart, lineEnd)
    if (line.trim() && !(skipFirstLine && lineStart === start)) {
      const indentation = line.match(/^[ \t]*/u)?.[0] ?? ''
      if (indentation.length < width) return null
      edits.push({
        start: lineStart,
        remove: width,
        insert: '',
      })
    }
    if (nextBreak < 0) break
    lineStart = nextBreak + 1
  }
  return edits
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
  if (containing.list && boundary.start > containing.start) {
    return blocks
  }
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

function SemanticListGroup({
  blocks,
  context,
  activeItem,
  children,
}: {
  blocks: MarkdownBlock[]
  context: DocumentRenderContext
  activeItem: number
  children(block: MarkdownBlock, item: RenderedListGroup['items'][number] | undefined): ReactNode
}) {
  const [rendered, setRendered] = useState<
    Array<{
      key: string
      item?: RenderedListGroup['items'][number]
    }>
  >([])
  const [error, setError] = useState<Error | null>(null)
  const first = blocks[0]

  useEffect(() => {
    let current = true
    setError(null)
    const keys = blocks.map((block, index) =>
      index === activeItem ? '' : markdownListItemRenderKey(block, context),
    )
    const previousByKey = new Map(
      rendered
        .filter((entry) => entry.item)
        .map((entry) => [entry.key, entry] as const),
    )
    const nextRendered = keys.map(
      (key) => previousByKey.get(key) ?? { key },
    )
    setRendered(nextRendered)
    const cancel = deferWork(() => {
      const scheduled = new Set<string>()
      blocks.forEach((block, index) => {
        const key = keys[index]
        if (!key || nextRendered[index]?.item || scheduled.has(key)) return
        scheduled.add(key)
        void renderMarkdownListItem(block, context).then(
          (item) => {
            if (!current) return
            setRendered((latest) =>
              latest.map((entry) =>
                entry.key === key ? { key, item } : entry,
              ),
            )
          },
          (reason: unknown) => {
            if (current) {
              setError(reason instanceof Error ? reason : new Error(String(reason)))
            }
          },
        )
      })
    })
    return () => {
      current = false
      cancel()
    }
  }, [activeItem, blocks, context])

  const listClassName = Array.from(
    new Set([
      ...(blocks.some((block) => block.list?.task)
        ? ['contains-task-list']
        : []),
      ...rendered.flatMap(
        ({ item }) => item?.listClassName?.split(' ') ?? [],
      ),
    ]),
  ).join(' ')
  const className = ['semantic-list-group', listClassName]
    .filter(Boolean)
    .join(' ')
  const items = blocks.map((block, index) => children(block, rendered[index]?.item))
  const list = first.list?.ordered ? (
    <ol className={className} start={first.list.start}>
      {items}
    </ol>
  ) : (
    <ul className={className}>{items}</ul>
  )
  return (
    <>
      {list}
      {error && (
        <div className="block-render-error" role="alert">
          Unable to render this list: {error.message}
        </div>
      )}
    </>
  )
}

function RenderedListItem({
  block,
  item,
  index,
  onActivate,
}: {
  block: MarkdownBlock
  item: RenderedListGroup['items'][number] | undefined
  index: number
  onActivate(index: number): void
}) {
  const activateFromPreview = (event: MouseEvent<HTMLElement>) => {
    if (
      !(event.target as HTMLElement).closest(
        'a, button, input, select, textarea, summary',
      )
    ) {
      onActivate(index)
    }
  }
  return (
    <div className="preview-block" data-block-id={block.id}>
      <div
        className="rendered-block semantic-list-item-content"
        onError={(event) => markImageFailure(event.target)}
        onClick={activateFromPreview}
        dangerouslySetInnerHTML={{ __html: item?.html ?? '' }}
      />
      <button
        type="button"
        className="edit-block-button"
        aria-label="Edit Markdown block"
        title="Edit Markdown block"
        onClick={() => onActivate(index)}
      >
        Edit
      </button>
    </div>
  )
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
  const editLabel = isFrontmatter
    ? `Edit ${block.type.toUpperCase()} front matter`
    : 'Edit Markdown block'

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
          aria-label={editLabel}
          title={editLabel}
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
  const initialEditingBlock = active
  const [draft, setDraft] = useState(toEditorValue(initialEditingBlock.source))
  const [activeInputFocused, setActiveInputFocused] = useState(false)
  const [activeSession, setActiveSession] = useState(0)
  const fencedCode = useMemo(() => parseFencedCode(draft), [draft])
  const displayMath = useMemo(
    () => draft.startsWith('$$\n') && draft.endsWith('\n$$'),
    [draft],
  )
  const activeFrontmatter =
    active.type === 'yaml' || active.type === 'toml'
  const projectionModeFor = (value: string): MarkerProjectionMode => {
    if (fencedCode || displayMath || activeFrontmatter) return 'plain'
    if (active.type === 'listItem') return 'list'
    if (
      active.type === 'blockquote' ||
      /^(?:[ \t]*>[ \t]?)+/u.test(value)
    ) {
      return 'quote'
    }
    return 'plain'
  }
  const markerProjection = useMemo(
    () => createMarkerProjection(draft, projectionModeFor(draft)),
    [active.type, activeFrontmatter, displayMath, draft, fencedCode],
  )
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const contentRef = useRef(content)
  const rangeRef = useRef<SourceRange>({
    start: initialEditingBlock.start,
    end: initialEditingBlock.end,
  })
  const composingRef = useRef(false)
  const codeTabEscapeRef = useRef(false)
  const mathEnterTokenRef = useRef<MathEnterToken | null>(null)
  const draftRevisionRef = useRef(0)
  const editorSessionRef = useRef(0)
  const editorLifetimeRef = useRef<object>({})
  const activeBlockIdentityRef = useRef<object>({})
  const interactionGenerationRef = useRef(0)
  const editorUndoRef = useRef<EditorUndoSnapshot[]>([])
  const pendingUndoRestoreRef = useRef<EditorUndoSnapshot | null>(null)
  const syntheticListSeparatorsRef = useRef<SyntheticListSeparator[]>([])
  const insertedBlocksRef = useRef(insertedBlocks)
  const editingBoundaryRef = useRef(editingBoundary)
  const selectionRef = useRef({
    start: 0,
    end: 0,
    direction: 'none' as SelectionDirection,
  })
  const pendingVisibleEditRef = useRef<VisibleEdit | null>(null)
  const visibleSelectionRef = useRef({ start: 0, end: 0 })
  const deferredSelectionRef = useRef<{ start: number; end: number } | null>(
    null,
  )
  const previousActiveRef = useRef(safeActive)
  const activeIndexRef = useRef(safeActive)
  const undoSessionRef = useRef(0)
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

  const separatorHasCurrentOrigin = (
    separator: SyntheticListSeparator,
  ): boolean =>
    separator.editorLifetime === editorLifetimeRef.current &&
    separator.originatingBlock === activeBlockIdentityRef.current &&
    separator.session === editorSessionRef.current

  const clearSyntheticListSeparators = () => {
    syntheticListSeparatorsRef.current = []
  }

  const transformSyntheticListSeparators = (
    before: string,
    after: string,
  ) => {
    const change = textReplacement(before, after)
    const delta = change.replacement.length - (change.end - change.start)
    syntheticListSeparatorsRef.current =
      syntheticListSeparatorsRef.current.flatMap((separator) => {
        if (!separatorHasCurrentOrigin(separator)) return []
        const nextOffset =
          separator.offset < change.start
            ? separator.offset
            : separator.offset >= change.end
              ? separator.offset + delta
              : -1
        return nextOffset >= 0 && after[nextOffset] === '\n'
          ? [{ ...separator, offset: nextOffset }]
          : []
      })
  }

  const trackSyntheticListSeparator = (offset: number) => {
    const separator: SyntheticListSeparator = {
      editorLifetime: editorLifetimeRef.current,
      originatingBlock: activeBlockIdentityRef.current,
      session: editorSessionRef.current,
      offset,
    }
    syntheticListSeparatorsRef.current = [
      ...syntheticListSeparatorsRef.current.filter(
        (candidate) =>
          separatorHasCurrentOrigin(candidate) && candidate.offset !== offset,
      ),
      separator,
    ]
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

  const rotateEditorSession = (
    preserveBoundary = false,
    preservePendingUndo = false,
  ) => {
    composingRef.current = false
    codeTabEscapeRef.current = false
    invalidateMathInteraction()
    if (!preservePendingUndo) pendingUndoRestoreRef.current = null
    draftRevisionRef.current += 1
    editorSessionRef.current += 1
    activeBlockIdentityRef.current = {}
    clearSyntheticListSeparators()
    setActiveInputFocused(document.activeElement === textareaRef.current)
    if (!preserveBoundary) {
      editingBoundaryRef.current = null
      setEditingBoundary(null)
    }
    setActiveSession((session) => session + 1)
  }

  useLayoutEffect(() => {
    const activeChanged = previousActiveRef.current !== safeActive
    if (activeChanged) activeIndexRef.current = safeActive
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
      if (sourceModeChanged) rotateEditorSession()
      previousActiveRef.current = safeActive
      previousSourceModeRef.current = true
      return
    }
    const externalChange = parentChanged && !acknowledged
    const acknowledgedTransaction =
      activeChanged &&
      acknowledged &&
      editorUndoRef.current.at(-1)?.expectedContent === content
    const transactionActivation =
      acknowledgedTransaction ||
      (activeChanged &&
        editorUndoRef.current.at(-1)?.expectedActiveBlock === safeActive &&
        editorUndoRef.current.at(-1)?.expectedContent === content)
    if ((activeChanged && !transactionActivation) || externalChange) {
      undoSessionRef.current += 1
    }
    if (sourceModeChanged || activeChanged || externalChange) {
      const retainBoundary =
        activeChanged &&
        editingBoundary?.content === content &&
        editingBoundary.retainOnActivation === true
      const semanticIndex =
        activeChanged &&
        editingBoundary?.content === content &&
        !retainBoundary
          ? model.blocks.findIndex(
              (block) =>
                block.start <= active.start && block.end >= active.end,
            )
          : -1
      const semanticActive = retainBoundary
        ? active
        : semanticIndex >= 0
            ? model.blocks[semanticIndex]
            : undefined
      const semanticEditorIndex = semanticActive
        ? parsedEditorBlocks.findIndex(
            (block) =>
              block.start === semanticActive.start &&
              block.end === semanticActive.end,
          )
        : -1
      const remappedUndo = editorUndoRef.current.at(-1)
      if (
        acknowledged &&
        semanticActive &&
        semanticEditorIndex >= 0 &&
        remappedUndo?.expectedContent === content &&
        remappedUndo.expectedActiveBlock !== semanticEditorIndex
      ) {
        remappedUndo.expectedActiveBlock = semanticEditorIndex
        remappedUndo.expectedDraft = toEditorValue(semanticActive.source)
        remappedUndo.expectedBlockId = semanticActive.id
        activeIndexRef.current = semanticEditorIndex
      }
      const preservePendingUndo =
        activeChanged &&
        !externalChange &&
        pendingUndoRestoreRef.current?.activeBlock === safeActive
      rotateEditorSession(retainBoundary, preservePendingUndo)
      setDraft(toEditorValue(semanticActive?.source ?? active.source))
      rangeRef.current = {
        start: semanticActive?.start ?? active.start,
        end: semanticActive?.end ?? active.end,
      }
      if (
        semanticEditorIndex >= 0 &&
        (semanticEditorIndex !== safeActive || activeBlock !== safeActive)
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
    activeBlock,
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
    syntheticListSeparatorsRef.current =
      snapshot.syntheticListSeparators.filter(separatorHasCurrentOrigin)
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
      if (previous.previewAll !== previewAll) {
        rotateEditorSession()
      } else {
        invalidateMathInteraction()
        setActiveInputFocused(document.activeElement === textareaRef.current)
      }
      previousDisplayModeRef.current = { sourceMode, previewAll }
    }
  }, [previewAll, sourceMode])

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    resizeTextarea(textarea)
    if (textarea && document.activeElement === textarea) {
      const deferred = deferredSelectionRef.current
      const pending = deferred ?? selectionRef.current
      textarea.setSelectionRange(
        markerProjection.toVisibleOffset(pending.start),
        markerProjection.toVisibleOffset(pending.end),
        selectionRef.current.direction,
      )
    }
  }, [active.id, draft, markerProjection, safeActive])

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea || sourceMode || !selection) return
    const start = markerProjection.toVisibleOffset(selection.start)
    const end = markerProjection.toVisibleOffset(selection.end)
    if (
      textarea.selectionStart !== start ||
      textarea.selectionEnd !== end ||
      textarea.selectionDirection !== selection.direction
    ) {
      invalidateMathInteraction()
      setEditorSelection(textarea, start, end, selection.direction)
    }
  }, [activeSession, markerProjection, selection, sourceMode])

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

  const reportProjectedSelection = (textarea: HTMLTextAreaElement) => {
    const direction = textarea.selectionDirection ?? 'none'
    const start = markerProjection.toCanonicalOffset(textarea.selectionStart)
    const end = markerProjection.toCanonicalOffset(textarea.selectionEnd)
    selectionRef.current = { start, end, direction }
    onSelectionChange?.({ start, end, direction })
  }

  function commitDraft(value: string) {
    transformSyntheticListSeparators(draft, value)
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
      syntheticListSeparators: syntheticListSeparatorsRef.current.map(
        (separator) => ({ ...separator }),
      ),
      expectedContent: '',
      expectedActiveBlock: safeActive,
      expectedDraft: '',
      expectedSession: undoSessionRef.current,
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
      syntheticListSeparators: syntheticListSeparatorsRef.current.map(
        (separator) => ({ ...separator }),
      ),
      expectedContent: '',
      expectedActiveBlock: safeActive,
      expectedDraft: '',
      expectedSession: undoSessionRef.current,
    }
  }

  const pushEditorUndo = (
    snapshot: EditorUndoSnapshot,
    expectedContent: string,
    expectedActiveBlock = safeActive,
    expectedDraft = draft,
  ) => {
    activeIndexRef.current = expectedActiveBlock
    const expectedBlockId =
      parseDocument(expectedContent).blocks[expectedActiveBlock]?.id
    editorUndoRef.current = [
      ...editorUndoRef.current,
      {
        ...snapshot,
        expectedContent,
        expectedActiveBlock,
        expectedDraft,
        expectedBlockId,
        expectedSession: undoSessionRef.current,
      },
    ].slice(-32)
  }

  const restoreEditorUndo = (): boolean => {
    const snapshot = editorUndoRef.current.at(-1)
    if (
      !snapshot ||
      snapshot.expectedActiveBlock !== activeIndexRef.current ||
      snapshot.expectedSession !== undoSessionRef.current ||
      snapshot.expectedContent !== contentRef.current ||
      snapshot.expectedDraft !== (textareaRef.current?.value ?? draft) ||
      (snapshot.expectedBlockId !== undefined &&
        parseDocument(contentRef.current).blocks[activeIndexRef.current]?.id !==
          snapshot.expectedBlockId)
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
    syntheticListSeparatorsRef.current =
      snapshot.syntheticListSeparators.filter(separatorHasCurrentOrigin)
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
    selectionDirection: SelectionDirection = 'none',
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
    setEditorSelection(
      textarea,
      selectionStart,
      selectionEnd,
      selectionDirection,
    )
    commitDraft(textarea.value)
    if (undoSnapshot) {
      pushEditorUndo(undoSnapshot, contentRef.current, safeActive, value)
    }
    reportSelection(textarea)
    afterCommit?.()
    deferredSelectionRef.current = {
      start: selectionStart,
      end: selectionEnd,
    }
    afterInteractionPaint(textarea, () => {
      setEditorSelection(
        textarea,
        selectionStart,
        selectionEnd,
        selectionDirection,
      )
      reportSelection(textarea)
    })
  }

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea || !formatRequest || formatRequest.id === handledFormatRef.current) return
    if (readOnly) return
    invalidateMathInteraction()
    handledFormatRef.current = formatRequest.id
    const selectionStart = markerProjection.toCanonicalOffset(
      textarea.selectionStart,
    )
    const selectionEnd = markerProjection.toCanonicalOffset(textarea.selectionEnd)
    const result = formattedValue(
      formatRequest.command,
      draft,
      selectionStart,
      selectionEnd,
    )
    commitDraft(result.value)
    afterInteractionPaint(textarea, () => {
      const projection = createMarkerProjection(
        result.value,
        projectionModeFor(result.value),
      )
      selectionRef.current = {
        start: result.selectionStart,
        end: result.selectionEnd,
        direction: 'none',
      }
      textarea.setSelectionRange(
        projection.toVisibleOffset(result.selectionStart),
        projection.toVisibleOffset(result.selectionEnd),
      )
    })
  }, [content, draft, formatRequest, markerProjection, onChange])

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

  const applyCanonicalListEdit = (
    value: string,
    selectionStart: number,
    selectionEnd: number,
    selectionDirection: SelectionDirection,
    sourcePrefix: string,
    nextSourcePrefix: string,
    undoSnapshot: EditorUndoSnapshot,
  ) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const previousContent = contentRef.current
    const previousRange = { ...rangeRef.current }
    const previousSource = previousContent.slice(
      previousRange.start,
      previousRange.end,
    )
    const sourceValue = restoreSourceEols(
      value,
      previousSource,
      nearestEol(previousContent, previousRange.start),
    )
    const prefixStart = previousRange.start - sourcePrefix.length
    const nextContent =
      previousContent.slice(0, prefixStart) +
      nextSourcePrefix +
      sourceValue +
      previousContent.slice(previousRange.end)
    const prefixDelta = nextSourcePrefix.length - sourcePrefix.length
    const nextRange = {
      start: previousRange.start + prefixDelta,
      end: previousRange.start + prefixDelta + sourceValue.length,
    }
    const totalDelta =
      nextSourcePrefix.length +
      sourceValue.length -
      sourcePrefix.length -
      (previousRange.end - previousRange.start)
    const existing =
      insertedBlocksRef.current.content === previousContent
        ? insertedBlocksRef.current.blocks
        : []
    const nextInserted = {
      content: nextContent,
      blocks: existing.map((block) =>
        block.offset > previousRange.end
          ? { ...block, offset: block.offset + totalDelta }
          : { ...block },
      ),
    }
    const nextBoundary = {
      content: nextContent,
      start: nextRange.start,
      end: nextRange.end,
    }
    const change = textReplacement(draft, value)
    setEditorSelection(textarea, change.start, change.end)
    textarea.setRangeText(
      change.replacement,
      change.start,
      change.end,
      'preserve',
    )
    setEditorSelection(
      textarea,
      selectionStart,
      selectionEnd,
      selectionDirection,
    )
    transformSyntheticListSeparators(draft, value)
    setDraft(value)
    draftRevisionRef.current += 1
    rangeRef.current = nextRange
    insertedBlocksRef.current = nextInserted
    editingBoundaryRef.current = nextBoundary
    setInsertedBlocks(nextInserted)
    setEditingBoundary(nextBoundary)
    contentRef.current = nextContent
    pendingAcknowledgementRef.current = nextContent
    pushEditorUndo(
      undoSnapshot,
      nextContent,
      safeActive,
      value,
    )
    onChange(nextContent)
    reportSelection(textarea)
    deferredSelectionRef.current = {
      start: selectionStart,
      end: selectionEnd,
    }
    afterInteractionPaint(textarea, () => {
      setEditorSelection(
        textarea,
        selectionStart,
        selectionEnd,
        selectionDirection,
      )
    })
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

  const exitListItem = (line: ListLine) => {
    const snapshot = currentUndoSnapshot()
    const previousContent = contentRef.current
    const previousRange = { ...rangeRef.current }
    const previousSource = previousContent.slice(
      previousRange.start,
      previousRange.end,
    )
    const eol = nearestEol(previousContent, previousRange.start)
    const before = draft.slice(0, line.start).replace(/\n$/u, '')
    const afterStart = line.end + (draft[line.end] === '\n' ? 1 : 0)
    const after = draft.slice(afterStart)
    const exactEmptyItem =
      active.type === 'listItem' &&
      !before &&
      !after &&
      line.start === 0 &&
      line.end === draft.length
    const previousListItem =
      blocks[safeActive - 1]?.list?.groupId === active.list?.groupId
    const nextListItem =
      blocks[safeActive + 1]?.list?.groupId === active.list?.groupId
    const hasPreviousItem =
      previousListItem ||
      (activeIndexRef.current > 0 && previousRange.start > 0)
    const needsPreviousSeparator =
      hasPreviousItem &&
      !previousContent
        .slice(0, previousRange.start)
        .endsWith(eol.repeat(2))
    const editorSource = before
      ? after
        ? `${before}\n\n\n\n${after}`
        : before
      : after
        ? `\n\n${after}`
        : ''
    let sourceValue = restoreSourceEols(
      editorSource,
      previousSource,
      eol,
    )
    if (exactEmptyItem) {
      sourceValue =
        `${needsPreviousSeparator ? eol : ''}${nextListItem ? eol : ''}`
    }
    const exitsIndependentTrailingItem =
      !exactEmptyItem &&
      !before &&
      !after &&
      active.type === 'listItem' &&
      previousRange.start > 0 &&
      !previousContent
        .slice(0, previousRange.start)
        .endsWith(`${eol}${eol}`)
    if (exitsIndependentTrailingItem) sourceValue = eol
    if (before && !after) sourceValue += `${eol}${eol}`
    const nextContent = replaceBlockSource(
      previousContent,
      previousRange,
      sourceValue,
    )
    const beforeSource = restoreSourceEols(before, previousSource, eol)
    const emptyOffset = exactEmptyItem
      ? previousRange.start + (needsPreviousSeparator ? eol.length : 0)
      : before
      ? previousRange.start + beforeSource.length + 2 * eol.length
      : exitsIndependentTrailingItem
        ? previousRange.start + eol.length
        : previousRange.start
    const replacementDelta =
      sourceValue.length - (previousRange.end - previousRange.start)
    const existing =
      insertedBlocksRef.current.content === previousContent
        ? insertedBlocksRef.current.blocks
        : []
    const paragraphBlock = {
      offset: emptyOffset,
      length: 0,
      leftPadding: before ? 2 * eol.length : 0,
      rightPadding: !before && after ? 2 * eol.length : 0,
    }
    const nextInserted = {
      content: nextContent,
      blocks: [
        ...existing
          .filter(
            (block) =>
              block.offset !== previousRange.start &&
              block.offset !== emptyOffset,
          )
          .map((block) =>
            block.offset > previousRange.end
              ? { ...block, offset: block.offset + replacementDelta }
              : { ...block },
          ),
        paragraphBlock,
      ],
    }
    const boundary = {
      content: nextContent,
      start: emptyOffset,
      end: emptyOffset,
      retainOnActivation: true,
    }
    const targetIndex = exactEmptyItem
      ? activeIndexRef.current
      : safeActive + (before ? 1 : 0)
    rotateEditorSession(true)
    setDraft('')
    rangeRef.current = { start: emptyOffset, end: emptyOffset }
    insertedBlocksRef.current = nextInserted
    editingBoundaryRef.current = boundary
    setInsertedBlocks(nextInserted)
    setEditingBoundary(boundary)
    contentRef.current = nextContent
    pendingAcknowledgementRef.current = nextContent
    pushEditorUndo(snapshot, nextContent, targetIndex, '')
    onChange(nextContent)
    onActiveBlockChange(targetIndex)
    afterPaint(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      textarea.focus()
      setEditorSelection(textarea, 0)
      reportSelection(textarea)
    })
  }

  const canonicalizeProjectedTextarea = (textarea: HTMLTextAreaElement) => {
    if (markerProjection.mode === 'plain') return
    const start = markerProjection.toCanonicalOffset(textarea.selectionStart)
    const end = markerProjection.toCanonicalOffset(textarea.selectionEnd)
    const direction = textarea.selectionDirection ?? 'none'
    textarea.value = draft
    textarea.setSelectionRange(start, end, direction)
  }

  const restoreProjectedTextarea = (textarea: HTMLTextAreaElement) => {
    const canonicalValue = textarea.value
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const direction = textarea.selectionDirection ?? 'none'
    const projection = createMarkerProjection(
      canonicalValue,
      projectionModeFor(canonicalValue),
    )
    textarea.value = projection.visible
    textarea.setSelectionRange(
      projection.toVisibleOffset(start),
      projection.toVisibleOffset(end),
      direction,
    )
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

    if (markerProjection.mode === 'quote' && unmodifiedEnter) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const lineStart = draft.lastIndexOf('\n', Math.max(0, start - 1)) + 1
      const nextBreak = draft.indexOf('\n', start)
      const lineEnd = nextBreak < 0 ? draft.length : nextBreak
      const line = draft.slice(lineStart, lineEnd)
      const prefix = line.match(/^[ \t]*(?:>[ \t]?)+/u)?.[0]
      if (prefix && start >= lineStart + prefix.length && end <= lineEnd) {
        event.preventDefault()
        const snapshot = currentUndoSnapshot()
        if (!line.slice(prefix.length).trim()) {
          const nextDraft =
            draft.slice(0, lineStart) + draft.slice(lineStart + prefix.length)
          applyControlledTextareaEdit(
            draft,
            nextDraft,
            lineStart,
            lineStart,
            undefined,
            snapshot,
          )
          return
        }
        const nextDraft =
          draft.slice(0, start) + `\n${prefix}` + draft.slice(end)
        const caret = start + 1 + prefix.length
        applyControlledTextareaEdit(
          draft,
          nextDraft,
          caret,
          caret,
          undefined,
          snapshot,
        )
        return
      }
    }

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

    const absoluteLineStart =
      contentRef.current.lastIndexOf('\n', rangeRef.current.start - 1) + 1
    const sourcePrefix = contentRef.current.slice(
      absoluteLineStart,
      rangeRef.current.start,
    )
    const firstLineIndent = /^[ \t]*$/u.test(sourcePrefix)
      ? sourcePrefix
      : ''
    const lineStart =
      draft.lastIndexOf('\n', Math.max(0, textarea.selectionStart - 1)) + 1
    const nextLineBreak = draft.indexOf('\n', textarea.selectionStart)
    const lineEnd = nextLineBreak < 0 ? draft.length : nextLineBreak
    const currentSource = contentRef.current.slice(
      rangeRef.current.start,
      rangeRef.current.end,
    )
    const absoluteCurrentLine = {
      start:
        rangeRef.current.start +
        sourceOffsetForEditorOffset(currentSource, lineStart),
      end:
        rangeRef.current.start +
        sourceOffsetForEditorOffset(currentSource, lineEnd),
    }
    const currentProtectedRanges =
      contentRef.current === content
        ? protectedRanges
        : remapProtectedRanges(content, contentRef.current, protectedRanges)
    const currentLineIsProtected = currentProtectedRanges.some(
      range =>
        absoluteCurrentLine.start < range.end &&
        absoluteCurrentLine.end > range.start,
    )
    const semanticListBlock = model.blocks.find(
      (block) =>
        block.type === 'listItem' &&
        block.list?.groupId === active.list?.groupId,
    )
    const inSemanticList =
      !fencedCode &&
      !displayMath &&
      !activeFrontmatter &&
      active.type === 'listItem' &&
      semanticListBlock !== undefined
    const listLine = inSemanticList
      && !currentLineIsProtected
      ? listLineAt(
          draft,
          textarea.selectionStart,
          firstLineIndent,
        )
      : null
    if (
      listLine &&
      unmodifiedEnter &&
      textarea.selectionStart >= listLine.prefixEnd &&
      textarea.selectionEnd <= listLine.end
    ) {
      event.preventDefault()
      if (!listLine.content.trim()) {
        const items = listItemRanges(draft, firstLineIndent)
        const item = items.find((candidate) => candidate.start === listLine.start)
        const parent = item ? listParent(items, item) : undefined
        if (item && parent) {
          const width = item.logicalIndent - parent.logicalIndent
          const edits = textOutdentEdits(
            draft,
            item.start,
            item.itemEnd,
            width,
            false,
          )
          if (edits && edits.length > 0) {
            const nextDraft = applyTextIndentEdits(draft, edits)
            const caret = mapSelectionOffset(textarea.selectionStart, edits)
            const snapshot = currentUndoSnapshot()
            applyControlledTextareaEdit(
              draft,
              nextDraft,
              caret,
              caret,
              undefined,
              snapshot,
            )
            return
          }
        }
        exitListItem(listLine)
        return
      }
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const suffix = draft
        .slice(end)
        .replace(/^ (?=[^\n])/u, '')
      const nextDraft =
        draft.slice(0, start) +
        '\n' +
        listLine.nextPrefix +
        suffix
      const caret = start + 1 + listLine.nextPrefix.length
      const snapshot = currentUndoSnapshot()
      const previousRangeStart = rangeRef.current.start
      const sourceSplitOffset = sourceOffsetForEditorOffset(currentSource, start)
      const sourceEol = nearestEol(contentRef.current, rangeRef.current.start)
      applyControlledTextareaEdit(
        draft,
        nextDraft,
        caret,
        caret,
        undefined,
        snapshot,
      )
      if (listLine.start === 0 && firstLineIndent.length === 0) {
        const nextItemDraft = nextDraft.slice(start + 1)
        const nextItemStart =
          previousRangeStart + sourceSplitOffset + sourceEol.length
        const nextEnd = rangeRef.current.end
        setDraft(nextItemDraft)
        rangeRef.current = {
          start: nextItemStart,
          end: nextEnd,
        }
        const nextBoundary = {
          content: contentRef.current,
          start: nextItemStart,
          end: nextEnd,
          retainOnActivation: true,
        }
        editingBoundaryRef.current = nextBoundary
        setEditingBoundary(nextBoundary)
        const undo = editorUndoRef.current.at(-1)
        if (undo) {
          undo.expectedActiveBlock = safeActive + 1
          undo.expectedDraft = nextItemDraft
          undo.expectedBlockId =
            parseDocument(contentRef.current).blocks[safeActive + 1]?.id
          activeIndexRef.current = safeActive + 1
        }
        onActiveBlockChange(safeActive + 1)
      }
      return
    }

    if (
      inSemanticList &&
      !currentLineIsProtected &&
      event.key === 'Tab' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !selectionIsInNonListMarkdown(
        draft,
        textarea.selectionStart,
        textarea.selectionEnd,
      )
    ) {
      const selectedRange = selectedListItemRange(
        draft,
        textarea.selectionStart,
        textarea.selectionEnd,
        firstLineIndent,
      )
      if (!selectedRange) return
      const items = listItemRanges(draft, firstLineIndent)
      const selectedRoot = items.find(
        (item) => item.start === selectedRange.start,
      )
      if (!selectedRoot) return
      let indentUnit = ''
      if (!event.shiftKey) {
        let previousSibling = items.find(
          (item) =>
            item.logicalIndent === selectedRoot.logicalIndent &&
            item.itemEnd === selectedRange.start,
        )
        let contextualItems = items
        if (!previousSibling && selectedRange.start === 0) {
          const previousBlock = blocks[safeActive - 1]
          if (previousBlock?.list?.groupId === active.list?.groupId) {
            const eol = nearestEol(contentRef.current, rangeRef.current.start)
            const prefixLength = toEditorValue(`${previousBlock.source}${eol}`).length
            const contextualDraft = `${toEditorValue(previousBlock.source)}\n${draft}`
            contextualItems = listItemRanges(contextualDraft, '')
            const contextualRoot = contextualItems.find(
              (item) => item.start === prefixLength,
            )
            previousSibling = contextualRoot
              ? contextualItems.find(
                  (item) =>
                    item.logicalIndent === contextualRoot.logicalIndent &&
                    item.itemEnd === contextualRoot.start,
                )
              : undefined
          }
        }
        if (!previousSibling) return
        indentUnit = listIndentUnitForParent(contextualItems, previousSibling)
      } else {
        let width = listOutdentWidth(items, selectedRoot, sourcePrefix)
        if (
          width === 0 &&
          selectedRange.start === 0 &&
          !sourcePrefix &&
          selectedRoot.logicalIndent > 0 &&
          blocks[safeActive - 1]?.list?.groupId === active.list?.groupId
        ) {
          width = selectedRoot.logicalIndent
        }
        if (width === 0) return
        const outdentEdits = textOutdentEdits(
          draft,
          selectedRange.start,
          selectedRange.end,
          width,
          selectedRange.start === 0 && sourcePrefix.length > 0,
        )
        if (!outdentEdits) return
        const nextSourcePrefix =
          selectedRange.start === 0 && sourcePrefix.length > 0
            ? sourcePrefix.slice(0, sourcePrefix.length - width)
            : sourcePrefix
        const syntheticSeparatorOffset = selectedRange.start - 1
        const syntheticSeparator =
          syntheticListSeparatorsRef.current.find(
            (candidate) =>
              separatorHasCurrentOrigin(candidate) &&
              candidate.offset === syntheticSeparatorOffset,
          )
        if (syntheticSeparator && draft[syntheticSeparatorOffset] === '\n') {
          outdentEdits.push({
            start: syntheticSeparatorOffset,
            remove: 1,
            insert: '',
          })
        }
        event.preventDefault()
        const nextDraft = applyTextIndentEdits(draft, outdentEdits)
        const nextStart = mapSelectionOffset(
          textarea.selectionStart,
          outdentEdits,
        )
        const nextEnd = mapSelectionOffset(textarea.selectionEnd, outdentEdits)
        const direction = textarea.selectionDirection ?? 'none'
        const snapshot = currentUndoSnapshot()
        if (nextSourcePrefix !== sourcePrefix) {
          applyCanonicalListEdit(
            nextDraft,
            nextStart,
            nextEnd,
            direction,
            sourcePrefix,
            nextSourcePrefix,
            snapshot,
          )
        } else {
          applyControlledTextareaEdit(
            draft,
            nextDraft,
            nextStart,
            nextEnd,
            undefined,
            snapshot,
            direction,
          )
          setEditorSelection(textarea, nextStart, nextEnd, direction)
          reportSelection(textarea)
        }
        return
      }
      const edits: TextIndentEdit[] = []
      let nextSourcePrefix = sourcePrefix
      let lineStart = selectedRange.start
      while (lineStart < selectedRange.end) {
        const nextBreak = draft.indexOf('\n', lineStart)
        const lineEnd = nextBreak < 0 ? draft.length : nextBreak
        const line = draft.slice(lineStart, lineEnd)
        if (line.trim()) {
          if (lineStart === 0 && sourcePrefix) {
            nextSourcePrefix = `${sourcePrefix}${indentUnit}`
          } else {
            edits.push({
              start: lineStart,
              remove: 0,
              insert: indentUnit,
            })
          }
        }
        if (nextBreak < 0) break
        lineStart = nextBreak + 1
      }
      if (
        /^\d+[.)]$/u.test(selectedRoot.marker) &&
        !/^1[.)]$/u.test(selectedRoot.marker) &&
        !(
          selectedRange.start === 0 &&
          contentRef.current
            .slice(0, rangeRef.current.start)
            .endsWith(
              nearestEol(contentRef.current, rangeRef.current.start).repeat(2),
            )
        ) &&
        (selectedRange.start === 0 ||
          (draft[selectedRange.start - 1] === '\n' &&
            draft[selectedRange.start - 2] !== '\n'))
      ) {
        edits.push({
          start: selectedRange.start,
          remove: 0,
          insert: '\n',
        })
      }
      if (edits.length === 0 && nextSourcePrefix === sourcePrefix) return
      event.preventDefault()
      const nextDraft = applyTextIndentEdits(draft, edits)
      const nextStart = mapSelectionOffset(textarea.selectionStart, edits)
      const nextEnd = mapSelectionOffset(textarea.selectionEnd, edits)
      const direction = textarea.selectionDirection ?? 'none'
      const snapshot = currentUndoSnapshot()
      if (nextSourcePrefix !== sourcePrefix) {
        applyCanonicalListEdit(
          nextDraft,
          nextStart,
          nextEnd,
          direction,
          sourcePrefix,
          nextSourcePrefix,
          snapshot,
        )
      } else {
        const insertedSeparator = edits.some(
          edit =>
            edit.start === selectedRange.start &&
            edit.remove === 0 &&
            edit.insert === '\n',
        )
        applyControlledTextareaEdit(
          draft,
          nextDraft,
          nextStart,
          nextEnd,
          () => {
            if (insertedSeparator) {
              trackSyntheticListSeparator(selectedRange.start)
            }
          },
          snapshot,
          direction,
        )
        setEditorSelection(textarea, nextStart, nextEnd, direction)
        reportSelection(textarea)
      }
      return
    }

    if (
      listLine &&
      event.key === 'Backspace' &&
      textarea.selectionStart === listLine.prefixEnd &&
      textarea.selectionEnd === listLine.prefixEnd &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey
    ) {
      event.preventDefault()
      const nextDraft =
        draft.slice(0, listLine.start) +
        listLine.indent +
        listLine.content +
        draft.slice(listLine.end)
      const caret = listLine.start + listLine.indent.length
      const snapshot = currentUndoSnapshot()
      applyControlledTextareaEdit(
        draft,
        nextDraft,
        caret,
        caret,
        undefined,
        snapshot,
      )
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
    rotateEditorSession()
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
          {(() => {
            const renderRow = (
              block: MarkdownBlock,
              index: number,
              renderedListItem?: RenderedListGroup['items'][number],
            ) => {
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
            const Row = block.list ? 'li' : 'div'
            return (
              <Fragment
                key={
                  index === safeActive
                    ? `active-block-row-${activeSession}`
                    : block.id
                }
              >
                {realIndex !== undefined && !block.list && (
                  <ExtractedBlockDropZone
                    boundary={realIndex}
                    dragging={draggedBlock !== null}
                    pointerId={dragPointerRef.current}
                    active={dropBoundary === realIndex}
                    onTarget={targetDropBoundary}
                  />
                )}
                <Row
                  data-list-group={block.list?.groupId}
                  {...(block.list?.ordered ? { value: block.list.value } : {})}
                  className={
                    index === safeActive
                      ? `editor-block-row${block.list ? ' semantic-list-item-row' : ''} is-active${markerProjection.mode === 'quote' ? ' is-active-quote' : ''}${block.list?.task ? ' active-task-list-item' : ''}${renderedListItem?.className ? ` ${renderedListItem.className}` : ''}`
                      : `editor-block-row${block.list ? ' semantic-list-item-row' : ''}${renderedListItem?.className ? ` ${renderedListItem.className}` : ''}`
                  }
                >
                  {realIndex !== undefined && block.list && (
                    <ExtractedBlockDropZone
                      boundary={realIndex}
                      dragging={draggedBlock !== null}
                      pointerId={dragPointerRef.current}
                      active={dropBoundary === realIndex}
                      onTarget={targetDropBoundary}
                    />
                  )}
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
                      {active.list?.task && (
                        <input
                          className="active-task-marker"
                          type="checkbox"
                          checked={/^[ \t]*[-+*][ \t]+\[[xX]\]/u.test(draft)}
                          disabled
                          aria-label={
                            markerProjection.visible.split(/\r?\n/u, 1)[0] ||
                            'Task item'
                          }
                        />
                      )}
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
                        value={markerProjection.visible}
                        onBeforeInput={(event) => {
                          const textarea = event.currentTarget
                          pendingVisibleEditRef.current = {
                            selectionStart: textarea.selectionStart,
                            selectionEnd: textarea.selectionEnd,
                            inputType: (event.nativeEvent as InputEvent).inputType,
                          }
                        }}
                        onFocus={() => setActiveInputFocused(true)}
                        onChange={(event) => {
                          if (readOnly) return
                          const textarea = event.currentTarget
                          const visibleEdit = pendingVisibleEditRef.current
                          pendingVisibleEditRef.current = null
                          const inputType = (event.nativeEvent as InputEvent)
                            .inputType
                          const canonicalValue =
                            markerProjection.applyVisibleEdit(
                              textarea.value,
                              visibleEdit ?? {
                                selectionStart: visibleSelectionRef.current.start,
                                selectionEnd: visibleSelectionRef.current.end,
                                inputType,
                              },
                            )
                          const nextProjection = createMarkerProjection(
                            canonicalValue,
                            projectionModeFor(canonicalValue),
                          )
                          const selectionStart = nextProjection.toCanonicalOffset(
                            textarea.selectionStart,
                          )
                          const selectionEnd = nextProjection.toCanonicalOffset(
                            textarea.selectionEnd,
                          )
                          const direction = textarea.selectionDirection ?? 'none'
                          textarea.value = canonicalValue
                          textarea.setSelectionRange(
                            selectionStart,
                            selectionEnd,
                            direction,
                          )
                          const historyInput =
                            inputType === 'historyUndo' ||
                            inputType === 'historyRedo'
                          if (
                            !historyInput &&
                            !composingRef.current &&
                            enterDisplayMathMode(canonicalValue)
                          ) {
                            restoreProjectedTextarea(textarea)
                            return
                          }
                          invalidateMathInteraction()
                          commitDraft(canonicalValue)
                          reportSelection(textarea)
                          if (!composingRef.current && autoSpacing) {
                            normalize(
                              canonicalValue,
                              selectionStart,
                              selectionEnd,
                            )
                          }
                          restoreProjectedTextarea(textarea)
                        }}
                        onSelect={(event) => {
                          const textarea = event.currentTarget
                          visibleSelectionRef.current = {
                            start: textarea.selectionStart,
                            end: textarea.selectionEnd,
                          }
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
                              reportProjectedSelection(textarea)
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
                          reportProjectedSelection(textarea)
                        }}
                        onPointerDown={() => {
                          invalidateMathInteraction()
                        }}
                        onBlur={(event) => {
                          invalidateMathInteraction()
                          setActiveInputFocused(false)
                          composingRef.current = false
                          codeTabEscapeRef.current = false
                          canonicalizeProjectedTextarea(event.currentTarget)
                          normalize(
                            event.currentTarget.value,
                            event.currentTarget.selectionStart,
                            event.currentTarget.selectionEnd,
                          )
                          restoreProjectedTextarea(event.currentTarget)
                        }}
                        onCompositionStart={() => {
                          invalidateMathInteraction()
                          composingRef.current = true
                        }}
                        onCompositionEnd={(event) => {
                          composingRef.current = false
                          invalidateMathInteraction()
                          canonicalizeProjectedTextarea(event.currentTarget)
                          if (enterDisplayMathMode(event.currentTarget.value)) {
                            restoreProjectedTextarea(event.currentTarget)
                            return
                          }
                          normalize(
                            event.currentTarget.value,
                            event.currentTarget.selectionStart,
                            event.currentTarget.selectionEnd,
                          )
                          restoreProjectedTextarea(event.currentTarget)
                        }}
                        onKeyDown={(event) => {
                          canonicalizeProjectedTextarea(event.currentTarget)
                          handleKeyDown(event)
                          restoreProjectedTextarea(event.currentTarget)
                        }}
                      />
                      {activeInputFocused && (
                        <ActiveBlockPreview source={draft} />
                      )}
                    </div>
                  ) : block.list ? (
                    <RenderedListItem
                      block={block}
                      item={renderedListItem}
                      index={index}
                      onActivate={activateBlock}
                    />
                  ) : (
                    <RenderedBlock
                      block={block}
                      context={renderContext}
                      editable
                      index={index}
                      onActivate={activateBlock}
                    />
                  )}
                </Row>
              </Fragment>
            )
            }
            const units: Array<{
              blocks: MarkdownBlock[]
              start: number
            }> = []
            blocks.forEach((block, index) => {
              const previous = units.at(-1)
              if (
                block.list &&
                previous?.blocks.at(-1)?.list?.groupId === block.list.groupId
              ) {
                previous.blocks.push(block)
              } else {
                units.push({ blocks: [block], start: index })
              }
            })
            return units.map((unit) => {
              const first = unit.blocks[0]
              if (!first.list) return renderRow(first, unit.start)
              return (
                <SemanticListGroup
                  key={
                    safeActive >= unit.start &&
                    safeActive < unit.start + unit.blocks.length
                      ? `active-list-group-${activeSession}`
                      : first.list.groupId
                  }
                  blocks={unit.blocks}
                  context={renderContext}
                  activeItem={
                    safeActive >= unit.start &&
                    safeActive < unit.start + unit.blocks.length
                      ? safeActive - unit.start
                      : -1
                  }
                >
                  {(block, item) =>
                    renderRow(
                      block,
                      unit.start + unit.blocks.indexOf(block),
                      item,
                    )
                  }
                </SemanticListGroup>
              )
            })
          })()}
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
