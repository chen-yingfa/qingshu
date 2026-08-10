import rehypeKatex from 'rehype-katex'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'

export interface MarkdownBlock {
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

interface MarkdownRoot {
  children: PositionedNode[]
}

const markdownParser = unified().use(remarkParse).use(remarkGfm).use(remarkMath)

export function parseBlocks(source: string): MarkdownBlock[] {
  const tree = markdownParser.parse(source) as MarkdownRoot

  return tree.children.flatMap((node) => {
    const start = node.position?.start.offset
    const end = node.position?.end.offset

    if (start === undefined || end === undefined) {
      return []
    }

    return [
      {
        type: node.type,
        source: source.slice(start, end),
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
  .use(rehypeSanitize)
  .use(rehypeKatex)
  .use(rehypeStringify)

export async function renderMarkdown(source: string): Promise<string> {
  return String(await renderer.process(source))
}
