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
  identifier?: string
  label?: string
  children?: PositionedNode[]
  position?: {
    start: { offset?: number }
    end: { offset?: number }
  }
}

interface FootnoteReference {
  start: number
  end: number
  label: string
  identifier: string
  ordinal: number
}

export interface DocumentRenderContext {
  supportSource: string
  footnoteSource: string
  references: FootnoteReference[]
  signature: string
}

export interface MarkdownDocumentModel {
  blocks: MarkdownBlock[]
  renderContext: DocumentRenderContext
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

function blocksFromTree(source: string, tree: MarkdownRoot): MarkdownBlock[] {
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

function frontMatterEnd(source: string): number {
  const opening = source.match(/^(?:\uFEFF)?(---|\+\+\+)[ \t]*\r?\n/u)
  if (!opening) return 0
  const escaped = opening[1].replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const closing = new RegExp(`^${escaped}[ \\t]*(?:\\r?\\n|$)`, 'gmu')
  closing.lastIndex = opening[0].length
  const match = closing.exec(source)
  return match ? match.index + match[0].length : 0
}

const renderer = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype)
  .use(rehypeSanitize, { ...defaultSchema, clobberPrefix: '' })
  .use(rehypeKatex)
  .use(rehypeStringify)

async function processMarkdown(source: string): Promise<string> {
  return String(await renderer.process(source))
}

function renderContextFromTree(
  source: string,
  tree: MarkdownRoot,
): DocumentRenderContext {
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

  const protectedFrontMatterEnd = frontMatterEnd(source)
  const counts = new Map<string, number>()
  const references: FootnoteReference[] = []
  const visit = (node: PositionedNode) => {
    if (node.type === 'footnoteReference') {
      const start = node.position?.start.offset
      const end = node.position?.end.offset
      if (
        start !== undefined &&
        end !== undefined &&
        start >= protectedFrontMatterEnd &&
        node.identifier
      ) {
        const identifier = node.identifier
        const ordinal = (counts.get(identifier) ?? 0) + 1
        counts.set(identifier, ordinal)
        references.push({
          start,
          end,
          identifier,
          label: node.label ?? identifier,
          ordinal,
        })
      }
      return
    }
    node.children?.forEach(visit)
  }
  tree.children.forEach(visit)

  const supportSource = support.join('\n\n')
  return {
    supportSource,
    footnoteSource: footnotes.join('\n\n'),
    references,
    signature: `${supportSource}\u0000${references
      .map(({ identifier, ordinal }) => `${identifier}:${ordinal}`)
      .join(',')}`,
  }
}

export function parseDocument(source: string): MarkdownDocumentModel {
  const tree = markdownParser.parse(source) as MarkdownRoot
  return {
    blocks: blocksFromTree(source, tree),
    renderContext: renderContextFromTree(source, tree),
  }
}

export function parseBlocks(source: string): MarkdownBlock[] {
  return parseDocument(source).blocks
}

export function createDocumentRenderContext(source: string): DocumentRenderContext {
  return parseDocument(source).renderContext
}

export function canonicalFootnoteId(identifier: string): string {
  return `cp-${Array.from(identifier, (character) =>
    character.codePointAt(0)!.toString(16),
  ).join('-')}`
}

function withoutFootnoteSection(html: string): string {
  return html.replace(
    /(?:\n)?<section[^>]*data-footnotes(?:=""|="true")?[^>]*>[\s\S]*?<\/section>\s*$/u,
    '',
  )
}

function canonicalizeFootnoteAttributes(
  html: string,
  references: FootnoteReference[],
): string {
  const definitionTargets = new Map<string, string>()
  const referenceTargets = new Map<string, string>()
  let referenceIndex = 0

  let rewritten = html.replace(
    /href="(#user-content-fn-(?!ref-)[^"]+)"/gu,
    (attribute, originalTarget: string) => {
      const reference = references[referenceIndex++]
      if (!reference) return attribute
      const canonicalTarget = `#user-content-fn-${canonicalFootnoteId(reference.identifier)}`
      definitionTargets.set(originalTarget, canonicalTarget)
      return `href="${canonicalTarget}"`
    },
  )

  referenceIndex = 0
  rewritten = rewritten.replace(
    /id="(user-content-fnref-[^"]+)"/gu,
    (attribute, originalId: string) => {
      const reference = references[referenceIndex++]
      if (!reference) return attribute
      const suffix = reference.ordinal === 1 ? '' : `-${reference.ordinal}`
      const canonicalId = `user-content-fnref-${canonicalFootnoteId(reference.identifier)}${suffix}`
      referenceTargets.set(`#${originalId}`, `#${canonicalId}`)
      return `id="${canonicalId}"`
    },
  )

  rewritten = rewritten.replace(
    /id="(user-content-fn-(?!ref-)[^"]+)"/gu,
    (attribute, originalId: string) => {
      const canonical = definitionTargets.get(`#${originalId}`)
      return canonical ? `id="${canonical.slice(1)}"` : attribute
    },
  )
  rewritten = rewritten.replace(
    /href="(#user-content-fnref-[^"]+)"/gu,
    (attribute, originalTarget: string) => {
      const canonical = referenceTargets.get(originalTarget)
      return canonical ? `href="${canonical}"` : attribute
    },
  )
  return rewritten
}

export async function renderMarkdown(source: string): Promise<string> {
  const context = parseDocument(source).renderContext
  return canonicalizeFootnoteAttributes(await processMarkdown(source), context.references)
}

export async function renderMarkdownBlock(
  block: MarkdownBlock,
  context: DocumentRenderContext,
): Promise<string> {
  const input = context.supportSource
    ? `${block.source}\n\n${context.supportSource}`
    : block.source
  let html = await processMarkdown(input)
  const references = context.references.filter(
    (reference) => reference.start >= block.start && reference.end <= block.end,
  )
  return withoutFootnoteSection(canonicalizeFootnoteAttributes(html, references))
}

export async function renderDocumentFootnotes(
  context: DocumentRenderContext,
): Promise<string> {
  if (!context.footnoteSource || context.references.length === 0) return ''
  const syntheticReferences = context.references
    .map(({ label }) => `[^${label}]`)
    .join(' ')
  const html = canonicalizeFootnoteAttributes(await processMarkdown(
    `${syntheticReferences}\n\n${context.footnoteSource}`,
  ), context.references)
  return (
    html.match(
      /<section[^>]*data-footnotes(?:=""|="true")?[^>]*>[\s\S]*?<\/section>/u,
    )?.[0] ?? ''
  )
}
