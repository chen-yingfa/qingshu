import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('css', css)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('python', python)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('xml', xml)

const aliases: Record<string, string> = {
  cjs: 'javascript',
  html: 'xml',
  js: 'javascript',
  jsx: 'javascript',
  md: 'markdown',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  ts: 'typescript',
  tsx: 'typescript',
}

export interface FencedCode {
  fence: string
  language: string
  code: string
  closed: boolean
}

function escapeHtml(source: string): string {
  return source
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function parseFencedCode(source: string): FencedCode | null {
  const firstBreak = source.indexOf('\n')
  const openingLine = (firstBreak < 0 ? source : source.slice(0, firstBreak)).replace(
    /\r$/u,
    '',
  )
  const opening = openingLine.match(/^ {0,3}(`{3,}|~{3,})[ \t]*([^ \t`]*)[^\n]*$/u)
  if (!opening) return null

  const fence = opening[1]
  const bodyStart = firstBreak < 0 ? source.length : firstBreak + 1
  const closingPattern = new RegExp(
    `^ {0,3}${fence[0].replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}{${fence.length},}[ \\t]*$`,
    'u',
  )
  const lines = source.slice(bodyStart).split(/\r?\n/u)
  const closed = lines.length > 0 && closingPattern.test(lines.at(-1) ?? '')
  const code = (closed ? lines.slice(0, -1) : lines).join('\n')

  return {
    fence,
    language: aliases[opening[2].toLowerCase()] ?? opening[2].toLowerCase(),
    code,
    closed,
  }
}

export function highlightCode(code: string, language: string): string {
  if (code.length > 100_000 || !language || !hljs.getLanguage(language)) {
    return escapeHtml(code)
  }
  if (language) {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value
  }
  return escapeHtml(code)
}
