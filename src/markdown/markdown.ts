import { fromHtmlIsomorphic } from 'hast-util-from-html-isomorphic'
import rehypeKatex from 'rehype-katex'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkFrontmatter from 'remark-frontmatter'
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
  list?: MarkdownListBlockMetadata
}

export interface MarkdownListBlockMetadata {
  groupId: string
  ordered: boolean
  start: number
  index: number
  value: number
  marker: string
  delimiter?: '.' | ')'
  loose: boolean
  task: boolean
}

interface FootnoteReference {
  start: number
  end: number
  label: string
  identifier: string
  ordinal: number
}

export interface DocumentRenderContext {
  source: string
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

export interface RenderedListItem {
  html: string
  className?: string
  listClassName?: string
}

export interface RenderedListGroup {
  ordered: boolean
  start: number
  className?: string
  items: RenderedListItem[]
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
  const listIdentities = new Map<string, number>()

  return tree.children.flatMap((node, topLevelIndex) => {
    const start = node.position?.start.offset
    const end = node.position?.end.offset

    if (start === undefined || end === undefined) {
      return []
    }

    const makeBlock = (
      type: string,
      blockStart: number,
      blockEnd: number,
      list?: MarkdownListBlockMetadata,
    ): MarkdownBlock => {
      const blockSource = source.slice(blockStart, blockEnd)
      const identity = `${type}-${sourceHash(blockSource)}`
      const occurrence = (identities.get(identity) ?? 0) + 1
      identities.set(identity, occurrence)
      return {
        id: `${identity}-${occurrence}`,
        type,
        source: blockSource,
        start: blockStart,
        end: blockEnd,
        ...(list ? { list } : {}),
      }
    }

    if (node.type !== 'list') {
      return [makeBlock(node.type, start, end)]
    }

    const items = node.children ?? []
    const ordered = node.ordered === true
    const semanticStart = ordered ? node.start ?? 1 : 1
    const groupIdentity = `${ordered ? 'ordered' : 'unordered'}-${sourceHash(
      source.slice(start, end),
    )}`
    const groupOccurrence = (listIdentities.get(groupIdentity) ?? 0) + 1
    listIdentities.set(groupIdentity, groupOccurrence)
    const groupId = `list-${groupIdentity}-${groupOccurrence}`
    const scanEnd =
      tree.children[topLevelIndex + 1]?.position?.start.offset ?? source.length
    const baseIndent =
      source.slice(start).match(/^(?:\uFEFF)?([ \t]*)/u)?.[1] ?? ''
    const semanticItems = items.flatMap((item, index) => {
      const positionedStart = item.position?.start.offset
      if (positionedStart === undefined) return []
      return [{
        item,
        start:
          index === 0 && source.startsWith('\uFEFF', start)
            ? start
            : positionedStart,
      }]
    })
    const emptyStarts = Array.from(
      source.slice(start, scanEnd).matchAll(
        /^(?:\uFEFF)?([ \t]*)(?:\d+[.)]|[-+*])[ \t]*(?:\[[ xX]\][ \t]*)?$/gmu,
      ),
    ).filter((match) => match[1] === baseIndent)
      .map((match) => start + match.index!)
    const itemStarts = Array.from(
      new Set([
        ...semanticItems.map((entry) => entry.start),
        ...emptyStarts,
      ]),
    ).sort((left, right) => left - right)

    return itemStarts.flatMap((itemStart, index) => {
      const semantic = semanticItems.find((entry) => entry.start === itemStart)
      const nextStart = itemStarts[index + 1]
      const emptyLineEnd = source.indexOf('\n', itemStart)
      const candidateEnd =
        semantic?.item.position?.end.offset ??
        (emptyLineEnd < 0
          ? source.length
          : emptyLineEnd - (source[emptyLineEnd - 1] === '\r' ? 1 : 0))
      let itemEnd = Math.min(candidateEnd, nextStart ?? scanEnd)
      if (nextStart !== undefined) {
        const beforeNext = source.slice(itemStart, nextStart)
        const separators = beforeNext.match(/(?:\r?\n[ \t]*)+$/u)
        if (separators?.index !== undefined) {
          itemEnd = itemStart + separators.index
        }
      }
      const firstLine =
        source.slice(itemStart, itemEnd).split(/\r?\n/u, 1)[0] ?? ''
      const markerMatch = firstLine.match(
        /^(?:\uFEFF)?[ \t]*(?:(\d+)([.)])|([-+*]))(?=[ \t]|$)/u,
      )
      const marker = markerMatch
        ? markerMatch[1]
          ? `${markerMatch[1]}${markerMatch[2]}`
          : markerMatch[3]
        : ordered
          ? `${semanticStart + index}.`
          : '-'
      return [
        makeBlock('listItem', itemStart, itemEnd, {
          groupId,
          ordered,
          start: semanticStart,
          index,
          value: semanticStart + index,
          marker,
          ...(ordered && markerMatch?.[2]
            ? { delimiter: markerMatch[2] as '.' | ')' }
            : {}),
          loose: node.spread === true || semantic?.item.spread === true,
          task:
            semantic?.item.checked === true ||
            semantic?.item.checked === false ||
            /^(?:\uFEFF)?[ \t]*[-+*][ \t]+\[[ xX]\]/u.test(firstLine),
        }),
      ]
    })
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
    source,
    supportSource,
    footnoteSource: footnotes.join(separator),
    references,
    eol,
    signature: `${supportSource}\u0000${references
      .map(({ identifier, ordinal }) => `${identifier}:${ordinal}`)
      .join(',')}`,
  }
}

function stringifyHastChildren(children: HastNode[] = []): string {
  const serializer = unified().use(rehypeStringify)
  return serializer.stringify({
    type: 'root',
    children,
  } as Parameters<typeof serializer.stringify>[0])
}

function hastTextWithoutNestedLists(node: HastNode): string {
  if (node.tagName === 'ul' || node.tagName === 'ol') return ''
  if (node.type === 'text') return node.value ?? ''
  return (node.children ?? []).map(hastTextWithoutNestedLists).join('')
}

function labelOwnTaskCheckbox(node: HastNode, label: string): void {
  if (node.tagName === 'ul' || node.tagName === 'ol') return
  if (node.tagName === 'input' && node.properties?.type === 'checkbox') {
    node.properties.ariaLabel = label
    return
  }
  node.children?.forEach((child) => labelOwnTaskCheckbox(child, label))
}

function labelTaskCheckboxes(node: HastNode): void {
  if (node.tagName === 'li') {
    const label = hastTextWithoutNestedLists(node).trim()
    if (label) labelOwnTaskCheckbox(node, label)
  }
  node.children?.forEach(labelTaskCheckboxes)
}

const listItemRenderCache = new Map<string, Promise<RenderedListItem>>()

export function markdownListItemRenderKey(
  block: MarkdownBlock,
  context: DocumentRenderContext,
): string {
  if (!block.list) throw new Error('A semantic list item requires list metadata')
  const references = context.references
    .filter(
      (reference) => reference.start >= block.start && reference.end <= block.end,
    )
    .map(
      ({ identifier, label, ordinal }) =>
        `${identifier}\u0001${label}\u0001${ordinal}`,
    )
    .join('\u0002')
  const metadata = block.list
  return [
    block.source,
    metadata.ordered ? 'ordered' : 'unordered',
    metadata.loose ? 'loose' : 'tight',
    metadata.task ? 'task' : 'plain',
    context.signature,
    references,
  ].join('\u0000')
}

export async function renderMarkdownListItem(
  block: MarkdownBlock,
  context: DocumentRenderContext,
): Promise<RenderedListItem> {
  if (!block.list) throw new Error('A semantic list item requires list metadata')
  const cacheKey = markdownListItemRenderKey(block, context)
  const cached = listItemRenderCache.get(cacheKey)
  if (cached) return cached

  const rendered = (async () => {
    const input = context.supportSource
      ? `${block.source}${context.eol}${context.eol}${context.supportSource}`
      : block.source
    const references = context.references.filter(
      (reference) => reference.start >= block.start && reference.end <= block.end,
    )
    let renderAst: MarkdownRoot | undefined
    if (block.list!.loose) {
      renderAst = parseMarkdownAst(input)
      const list = renderAst.children.find((node) => node.type === 'list')
      if (list) {
        list.spread = true
        const item = list.children?.find((child) => child.type === 'listItem')
        if (item) item.spread = true
      }
    }
    const html = withoutFootnoteSection(
      await processMarkdown(input, references, renderAst),
    )
    const fragment = fromHtmlIsomorphic(html, { fragment: true }) as HastNode
    const list = fragment.children?.find(
      (node) => node.tagName === (block.list!.ordered ? 'ol' : 'ul'),
    )
    const item = list?.children?.find((node) => node.tagName === 'li')
    if (!list || !item) throw new Error('Rendered list item has no list container')
    labelTaskCheckboxes(item)
    const listClasses = list.properties?.className
    const itemClasses = item.properties?.className
    return {
      html: stringifyHastChildren(item.children),
      ...(itemClasses
        ? {
            className: (Array.isArray(itemClasses)
              ? itemClasses
              : [itemClasses]
            ).map(String).join(' '),
          }
        : {}),
      ...(listClasses
        ? {
            listClassName: (Array.isArray(listClasses)
              ? listClasses
              : [listClasses]
            ).map(String).join(' '),
          }
        : {}),
    }
  })()
  listItemRenderCache.set(cacheKey, rendered)
  if (listItemRenderCache.size > 512) {
    listItemRenderCache.delete(listItemRenderCache.keys().next().value!)
  }
  try {
    return await rendered
  } catch (error) {
    listItemRenderCache.delete(cacheKey)
    throw error
  }
}

export async function renderMarkdownListGroup(
  blocks: MarkdownBlock[],
  context: DocumentRenderContext,
): Promise<RenderedListGroup> {
  const first = blocks[0]
  const last = blocks.at(-1)
  if (!first?.list || !last?.list) {
    throw new Error('A semantic list group requires list-item blocks')
  }
  const items = await Promise.all(
    blocks.map((block) => renderMarkdownListItem(block, context)),
  )
  const className = Array.from(
    new Set(items.flatMap((item) => item.listClassName?.split(' ') ?? [])),
  ).join(' ')
  return {
    ordered: first.list.ordered,
    start: first.list.start,
    ...(className ? { className } : {}),
    items,
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
    .use(remarkFrontmatter, ['yaml', 'toml'])
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
  let renderAst: MarkdownRoot | undefined
  if (block.list?.loose) {
    renderAst = parseMarkdownAst(input)
    const list = renderAst.children.find((node) => node.type === 'list')
    if (list) {
      list.spread = true
      const item = list.children?.find((child) => child.type === 'listItem')
      if (item) item.spread = true
    }
  }
  const html = withoutFootnoteSection(
    await processMarkdown(input, references, renderAst),
  )
  if (!block.list?.ordered) return html
  return html.replace(
    /<ol(?: start="\d+")?>/u,
    `<ol start="${block.list.value}">`,
  )
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
