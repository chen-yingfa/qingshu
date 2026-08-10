import rehypeKatex from 'rehype-katex'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'

export interface MarkdownBlock {
  id: string
  type: string
  source: string
  start: number
  end: number
}

interface PositionedNode {
  type: string
  position?: {
    start: { offset?: number }
    end: { offset?: number }
  }
}

interface FootnoteReference {
  start: number
  end: number
  label: string
  ordinal: number
}

export interface DocumentRenderContext {
  supportSource: string
  footnoteSource: string
  references: FootnoteReference[]
  signature: string
}

interface MarkdownRoot {
  children: PositionedNode[]
}

const markdownParser = unified().use(remarkParse).use(remarkGfm).use(remarkMath)

function sourceHash(source: string): string {
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function parseBlocks(source: string): MarkdownBlock[] {
  const tree = markdownParser.parse(source) as MarkdownRoot
  const identities = new Map<string, number>()

  return tree.children.flatMap((node) => {
    const start = node.position?.start.offset
    const end = node.position?.end.offset

    if (start === undefined || end === undefined) {
      return []
    }

    const blockSource = source.slice(start, end)
    const identity = `${node.type}-${sourceHash(blockSource)}`
    const occurrence = (identities.get(identity) ?? 0) + 1
    identities.set(identity, occurrence)

    return [
      {
        id: `${identity}-${occurrence}`,
        type: node.type,
        source: blockSource,
        start,
        end,
      },
    ]
  })
}

const renderer = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype)
  .use(rehypeSanitize, { ...defaultSchema, clobberPrefix: '' })
  .use(rehypeKatex)
  .use(rehypeStringify)

export async function renderMarkdown(source: string): Promise<string> {
  return String(await renderer.process(source))
}

function footnoteIdentifier(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/gu, '-')
}

export function createDocumentRenderContext(source: string): DocumentRenderContext {
  const tree = markdownParser.parse(source) as MarkdownRoot
  const support: string[] = []
  const footnotes: string[] = []

  for (const node of tree.children) {
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    if (start === undefined || end === undefined) continue
    if (node.type === 'definition' || node.type === 'footnoteDefinition') {
      const definition = source.slice(start, end)
      support.push(definition)
      if (node.type === 'footnoteDefinition') footnotes.push(definition)
    }
  }

  const counts = new Map<string, number>()
  const references: FootnoteReference[] = []
  const referencePattern = /\[\^([^\]\r\n]+)\](?!:)/gu
  for (const match of source.matchAll(referencePattern)) {
    const label = match[1]
    const normalized = footnoteIdentifier(label)
    const ordinal = (counts.get(normalized) ?? 0) + 1
    counts.set(normalized, ordinal)
    references.push({
      start: match.index,
      end: match.index + match[0].length,
      label,
      ordinal,
    })
  }

  const supportSource = support.join('\n\n')
  return {
    supportSource,
    footnoteSource: footnotes.join('\n\n'),
    references,
    signature: `${supportSource}\u0000${references
      .map(({ label, ordinal }) => `${footnoteIdentifier(label)}:${ordinal}`)
      .join(',')}`,
  }
}

function withoutFootnoteSection(html: string): string {
  return html.replace(
    /(?:\n)?<section[^>]*data-footnotes(?:=""|="true")?[^>]*>[\s\S]*?<\/section>\s*$/u,
    '',
  )
}

export async function renderMarkdownBlock(
  block: MarkdownBlock,
  context: DocumentRenderContext,
): Promise<string> {
  const input = context.supportSource
    ? `${block.source}\n\n${context.supportSource}`
    : block.source
  let html = withoutFootnoteSection(await renderMarkdown(input))
  const references = context.references.filter(
    (reference) => reference.start >= block.start && reference.end <= block.end,
  )
  let referenceIndex = 0
  html = html.replace(
    /id="user-content-fnref-([^"]+)"/gu,
    (_match, generated: string) => {
      const reference = references[referenceIndex++]
      if (!reference) return `id="user-content-fnref-${generated}"`
      const suffix = reference.ordinal === 1 ? '' : `-${reference.ordinal}`
      return `id="user-content-fnref-${footnoteIdentifier(reference.label)}${suffix}"`
    },
  )
  return html
}

export async function renderDocumentFootnotes(
  context: DocumentRenderContext,
): Promise<string> {
  if (!context.footnoteSource || context.references.length === 0) return ''
  const syntheticReferences = context.references
    .map(({ label }) => `[^${label}]`)
    .join(' ')
  const html = await renderMarkdown(
    `${syntheticReferences}\n\n${context.footnoteSource}`,
  )
  return (
    html.match(
      /<section[^>]*data-footnotes(?:=""|="true")?[^>]*>[\s\S]*?<\/section>/u,
    )?.[0] ?? ''
  )
}
