import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import type { EditorSelection } from '../hooks/useDocument'

export type FormatCommand =
  | 'heading'
  | 'bold'
  | 'italic'
  | 'link'
  | 'code'
  | 'math'
  | 'quote'
  | 'unordered-list'

export interface FormatRequest {
  id: number
  command: FormatCommand
}

export function nearestEol(source: string, offset: number): '\n' | '\r\n' {
  const before = Array.from(source.slice(0, offset).matchAll(/\r\n|\n/gu)).at(-1)?.[0]
  if (before) return before as '\n' | '\r\n'
  const after = source.slice(offset).match(/\r\n|\n/u)?.[0]
  return (after as '\n' | '\r\n' | undefined) ??
    (source.includes('\r\n') ? '\r\n' : '\n')
}

export function toEditorValue(source: string): string {
  return source.replaceAll('\r\n', '\n')
}

export function restoreSourceEols(
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
    } else normalizedOffset += part.length
  }
  let prefix = 0
  while (
    prefix < previous.length &&
    prefix < value.length &&
    previous[prefix] === value[prefix]
  ) prefix += 1
  let suffix = 0
  while (
    suffix < previous.length - prefix &&
    suffix < value.length - prefix &&
    previous[previous.length - 1 - suffix] === value[value.length - 1 - suffix]
  ) suffix += 1

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

export function sourceOffsetForEditorOffset(
  sourceValue: string,
  editorOffset: number,
): number {
  let sourceOffset = 0
  let visibleOffset = 0
  while (sourceOffset < sourceValue.length && visibleOffset < editorOffset) {
    sourceOffset += sourceValue.startsWith('\r\n', sourceOffset) ? 2 : 1
    visibleOffset += 1
  }
  return sourceOffset
}

export function applyInlineFormat(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
) {
  const selection = value.slice(start, end)
  return {
    value: value.slice(0, start) + before + selection + after + value.slice(end),
    selectionStart: start + before.length,
    selectionEnd: end + before.length,
  }
}

export function textReplacement(before: string, after: string) {
  let start = 0
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  ) start += 1
  let suffix = 0
  while (
    suffix < before.length - start &&
    suffix < after.length - start &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) suffix += 1
  return {
    start,
    end: before.length - suffix,
    replacement: after.slice(start, after.length - suffix),
  }
}

function prefixLines(
  value: string,
  start: number,
  end: number,
  prefix: string,
) {
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const replacement = value
    .slice(lineStart, end)
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n')
  return {
    value: value.slice(0, lineStart) + replacement + value.slice(end),
    selectionStart: start + prefix.length,
    selectionEnd: lineStart + replacement.length,
  }
}

export function formattedValue(
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
        (selection.trim() && (/^\s/u.test(selection) || /\s$/u.test(selection)))
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

export function afterPaint(callback: () => void) {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(callback)
  else setTimeout(callback, 0)
}

export function DocumentSourceEditor({
  content,
  contentRevision,
  formatRequest,
  onChange,
  selection,
  onSelectionChange,
}: {
  content: string
  contentRevision: number
  formatRequest?: FormatRequest
  onChange(content: string): void
  selection?: EditorSelection
  onSelectionChange?(selection: EditorSelection): void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const handledFormatRef = useRef(0)
  const [draft, setDraft] = useState(toEditorValue(content))
  const parentContentRef = useRef(content)
  const canonicalContentRef = useRef(content)
  const nativeInputValueRef = useRef<string | null>(null)
  const lastParentRevisionRef = useRef(contentRevision)
  const nextLocalRevisionRef = useRef(contentRevision)
  const pendingAcknowledgementsRef = useRef(new Map<number, string>())

  const reportSelection = (textarea: HTMLTextAreaElement) => {
    onSelectionChange?.({
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      direction: textarea.selectionDirection ?? 'none',
    })
  }

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea || !selection) return
    textarea.setSelectionRange(
      Math.min(selection.start, textarea.value.length),
      Math.min(selection.end, textarea.value.length),
      selection.direction,
    )
  }, [selection])

  useLayoutEffect(() => {
    if (
      content === parentContentRef.current &&
      contentRevision === lastParentRevisionRef.current
    ) return
    if (contentRevision < lastParentRevisionRef.current) return
    const pending = pendingAcknowledgementsRef.current
    let acknowledged = pending.get(contentRevision) === content
    if (acknowledged) {
      for (const revision of pending.keys()) {
        if (revision <= contentRevision) pending.delete(revision)
      }
    } else if (
      contentRevision <= nextLocalRevisionRef.current &&
      contentRevision > lastParentRevisionRef.current
    ) acknowledged = true
    lastParentRevisionRef.current = contentRevision
    nextLocalRevisionRef.current = Math.max(
      nextLocalRevisionRef.current,
      contentRevision,
    )
    parentContentRef.current = content
    if (!acknowledged) {
      pending.clear()
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

  const applyNativeEdit = (result: ReturnType<typeof formattedValue>) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const change = textReplacement(draft, result.value)
    textarea.focus()
    textarea.setSelectionRange(change.start, change.end)
    nativeInputValueRef.current = null
    const nativeApplied =
      typeof document.execCommand === 'function' &&
      document.execCommand('insertText', false, change.replacement)
    if (!nativeApplied) {
      textarea.setRangeText(
        change.replacement,
        change.start,
        change.end,
        'preserve',
      )
      commit(textarea.value, result.selectionEnd)
    } else if (nativeInputValueRef.current !== result.value) {
      commit(result.value, result.selectionEnd)
    }
    nativeInputValueRef.current = null
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
    ) return
    handledFormatRef.current = formatRequest.id
    applyNativeEdit(
      formattedValue(
        formatRequest.command,
        draft,
        textarea.selectionStart,
        textarea.selectionEnd,
      ),
    )
  }, [draft, formatRequest, onChange])

  return (
    <textarea
      ref={textareaRef}
      className="source-document"
      aria-label="Markdown source"
      autoFocus
      spellCheck={false}
      value={draft}
      onChange={(event) => {
        nativeInputValueRef.current = event.target.value
        commit(event.target.value, event.target.selectionStart)
        reportSelection(event.currentTarget)
      }}
      onSelect={(event) => reportSelection(event.currentTarget)}
      onKeyDown={(event) => {
        if (
          event.key !== 'Tab' ||
          event.shiftKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          event.nativeEvent.isComposing
        ) return
        event.preventDefault()
        applyNativeEdit(
          applyInlineFormat(
            draft,
            event.currentTarget.selectionStart,
            event.currentTarget.selectionEnd,
            '  ',
            '',
          ),
        )
      }}
    />
  )
}
