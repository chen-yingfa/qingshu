import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

export interface MarkdownAstNode {
  type: string
  value?: string
  url?: string
  identifier?: string
  label?: string
  children?: MarkdownAstNode[]
  position?: {
    start: { offset?: number }
    end: { offset?: number }
  }
}

export interface MarkdownAstRoot extends MarkdownAstNode {
  children: MarkdownAstNode[]
}

const markdownParser = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml', 'toml'])
  .use(remarkGfm)
  .use(remarkMath)

export function parseMarkdownAst(source: string): MarkdownAstRoot {
  const tree = markdownParser.parse(source) as MarkdownAstRoot
  if (!source.startsWith('\uFEFF')) return tree
  const restoreBomOffsets = (node: MarkdownAstNode, depth = 0) => {
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    if (start !== undefined) {
      node.position!.start.offset =
        start === 0 && depth <= 1 ? 0 : start + 1
    }
    if (end !== undefined) node.position!.end.offset = end + 1
    node.children?.forEach((child) => restoreBomOffsets(child, depth + 1))
  }
  restoreBomOffsets(tree)
  return tree
}
