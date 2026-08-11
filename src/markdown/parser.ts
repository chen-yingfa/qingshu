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
  return markdownParser.parse(source) as MarkdownAstRoot
}
