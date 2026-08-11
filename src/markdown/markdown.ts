import { fromHtmlIsomorphic } from 'hast-util-from-html-isomorphic'
import rehypeKatex from 'rehype-katex'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'

import { highlightCode } from './code'
import {
  parseMarkdownAst,
  type MarkdownAstNode as PositionedNode,
  type MarkdownAstRoot as MarkdownRoot,
} from './parser'

export interface MarkdownBlock {
  id: string
  type: string
  source: string
  start: number
  end: number
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
  eol: '\n' | '\r\n'
}

export interface MarkdownDocumentModel {
  blocks: MarkdownBlock[]
  renderContext: DocumentRenderContext
  ast: MarkdownRoot
}

interface HastNode {
  type: string
  value?: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

function highlightRenderedCode() {
  return (tree: HastNode) => {
    const visit = (node: HastNode) => {
      if (node.tagName === 'pre') {
        const code = node.children?.find((child) => child.tagName === 'code')
        if (code) {
          const className = code.properties?.className
          const classes = Array.isArray(className)
            ? className.map(String)
            : className
              ? [String(className)]
              : []
          const languageClass = classes.find((name) =>
            name.startsWith('language-'),
          )
          const language = languageClass?.slice('language-'.length) ?? ''
          const source =
            code.children
              ?.map((child) => (child.type === 'text' ? child.value ?? '' : ''))
              .join('') ?? ''
          const fragment = fromHtmlIsomorphic(
            highlightCode(source, language),
            { fragment: true },
          ) as HastNode
          code.properties = {
            ...code.properties,
            className: ['hljs', ...classes],
          }
          code.children = fragment.children ?? []
        }
      }
      node.children?.forEach(visit)
    }
    visit(tree)
  }
}

const safeProtocols = {
  ...defaultSchema.protocols,
  src: [...(defaultSchema.protocols?.src ?? []), 'blob'],
}

const initialRenderSchema = {
  ...defaultSchema,
  clobberPrefix: '',
  protocols: safeProtocols,
}

const mathMlTags = [
  'annotation',
  'math',
  'menclose',
  'mfrac',
  'mglyph',
  'mi',
  'mn',
  'mo',
  'mover',
  'mpadded',
  'mphantom',
  'mroot',
  'mrow',
  'mspace',
  'msqrt',
  'mstyle',
  'msub',
  'msubsup',
  'msup',
  'mtable',
  'mtd',
  'mtext',
  'mtr',
  'munder',
  'munderover',
  'semantics',
]

const finalRenderSchema = {
  ...initialRenderSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), ...mathMlTags],
  attributes: {
    ...defaultSchema.attributes,
    '*': [
      ...(defaultSchema.attributes?.['*'] ?? []),
      'className',
      'style',
      'ariaHidden',
    ],
    annotation: ['encoding'],
    math: ['display', 'xmlns'],
    menclose: ['notation'],
    mo: ['accent', 'fence', 'largeop', 'minsize', 'movablelimits', 'separator', 'stretchy', 'symmetric'],
    mspace: ['depth', 'height', 'width'],
    mstyle: ['displaystyle', 'mathcolor', 'mathsize', 'scriptlevel'],
    mtable: ['columnalign', 'columnlines', 'columnspacing', 'rowalign', 'rowlines', 'rowspacing'],
    mtd: ['columnalign', 'columnspan', 'rowalign', 'rowspan'],
  },
}

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

export function frontMatterEnd(source: string): number {
  const opening = source.match(/^(?:\uFEFF)?(---|\+\+\+)[ \t]*\r?\n/u)
  if (!opening) return 0
  const escaped = opening[1].replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const closing = new RegExp(`^${escaped}[ \\t]*(?:\\r?\\n|$)`, 'gmu')
  closing.lastIndex = opening[0].length
  const match = closing.exec(source)
  return match ? match.index + match[0].length : 0
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

  const eol = source.match(/\r\n|\n/u)?.[0] === '\r\n' ? '\r\n' : '\n'
  const separator = eol + eol
  const supportSource = support.join(separator)
  return {
    supportSource,
    footnoteSource: footnotes.join(separator),
    references,
    eol,
    signature: `${supportSource}\u0000${references
      .map(({ identifier, ordinal }) => `${identifier}:${ordinal}`)
      .join(',')}`,
  }
}

export function parseDocument(source: string): MarkdownDocumentModel {
  const tree = parseMarkdownAst(source)
  return {
    blocks: blocksFromTree(source, tree),
    renderContext: renderContextFromTree(source, tree),
    ast: tree,
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

function canonicalizeMdastFootnotes() {
  return (tree: PositionedNode) => {
    const visit = (node: PositionedNode) => {
      if (
        (node.type === 'footnoteReference' ||
          node.type === 'footnoteDefinition') &&
        node.identifier
      ) {
        node.identifier = canonicalFootnoteId(node.identifier)
        node.label = node.identifier
      }
      node.children?.forEach(visit)
    }
    visit(tree)
  }
}

function canonicalizeHastFootnoteReferences(options?: {
  references?: FootnoteReference[]
}) {
  return (tree: HastNode) => {
    let index = 0
    const visit = (node: HastNode) => {
      if (
        node.tagName === 'a' &&
        node.properties &&
        Object.hasOwn(node.properties, 'dataFootnoteRef')
      ) {
        const reference = options?.references?.[index++]
        if (reference) {
          const base = canonicalFootnoteId(reference.identifier)
          const suffix = reference.ordinal === 1 ? '' : `-${reference.ordinal}`
          node.properties.href = `#user-content-fn-${base}`
          node.properties.id = `user-content-fnref-${base}${suffix}`
        }
      }
      node.children?.forEach(visit)
    }
    visit(tree)
  }
}

async function processMarkdown(
  source: string,
  references?: FootnoteReference[],
  ast?: MarkdownRoot,
): Promise<string> {
  const renderer = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(canonicalizeMdastFootnotes)
    .use(remarkRehype)
    .use(canonicalizeHastFootnoteReferences, { references })
    .use(rehypeSanitize, initialRenderSchema)
    .use(highlightRenderedCode)
    .use(rehypeKatex)
    .use(rehypeSanitize, finalRenderSchema)
    .use(rehypeStringify)
  if (!ast) return String(await renderer.process(source))
  const rendered = await renderer.run(
    structuredClone(ast) as Parameters<typeof renderer.run>[0],
  )
  return renderer.stringify(rendered)
}

function withoutFootnoteSection(html: string): string {
  return html.replace(
    /(?:\n)?<section[^>]*data-footnotes(?:=""|="true")?[^>]*>[\s\S]*?<\/section>\s*$/u,
    '',
  )
}

export function hasRenderableMath(
  source: string,
  model: MarkdownDocumentModel = parseDocument(source),
): boolean {
  let found = false
  const visit = (node: PositionedNode) => {
    if (found) return
    if (node.type === 'math') {
      found = true
      return
    }
    if (node.type === 'inlineMath') {
      const end = node.position?.end.offset
      // remark-math interprets the dollar before a second price as a closing
      // delimiter in prose such as "$5 and $10". A digit immediately after
      // that delimiter identifies the common currency form.
      if (end === undefined || !/^\d/u.test(source.slice(end))) found = true
      return
    }
    node.children?.forEach(visit)
  }
  visit(model.ast)
  return found
}

export async function renderMarkdown(
  source: string,
  model: MarkdownDocumentModel = parseDocument(source),
): Promise<string> {
  return processMarkdown(source, model.renderContext.references, model.ast)
}

export async function renderMarkdownBlock(
  block: MarkdownBlock,
  context: DocumentRenderContext,
): Promise<string> {
  const input = context.supportSource
    ? `${block.source}${context.eol}${context.eol}${context.supportSource}`
    : block.source
  const references = context.references.filter(
    (reference) => reference.start >= block.start && reference.end <= block.end,
  )
  return withoutFootnoteSection(await processMarkdown(input, references))
}

export async function renderDocumentFootnotes(
  context: DocumentRenderContext,
): Promise<string> {
  if (!context.footnoteSource || context.references.length === 0) return ''
  const syntheticReferences = context.references
    .map(({ label }) => `[^${label}]`)
    .join(' ')
  const html = await processMarkdown(
    `${syntheticReferences}${context.eol}${context.eol}${context.footnoteSource}`,
    context.references,
  )
  return (
    html.match(
      /<section[^>]*data-footnotes(?:=""|="true")?[^>]*>[\s\S]*?<\/section>/u,
    )?.[0] ?? ''
  )
}
