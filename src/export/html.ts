import { renderMarkdown } from '../markdown/markdown'

const exportStyles = `
:root{color-scheme:light;--ink:#292622;--muted:#736d65;--accent:#9b6039;--line:#ddd7ce;--wash:#f6f2eb}
*{box-sizing:border-box}
html{background:#ece8e1}
body{max-width:850px;min-height:100vh;margin:0 auto;padding:72px clamp(28px,8vw,88px);color:var(--ink);background:#fffefa;box-shadow:0 0 60px rgba(41,34,27,.10);font:17px/1.82 Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans CJK SC","Microsoft YaHei",sans-serif;overflow-wrap:anywhere}
h1,h2,h3,h4,h5,h6{margin:1.7em 0 .65em;line-height:1.28;letter-spacing:-.018em}
h1{margin-top:0;font-size:2.35em}h2{padding-bottom:.24em;border-bottom:1px solid var(--line);font-size:1.7em}h3{font-size:1.32em}
p,ul,ol,blockquote,pre,table{margin:1.05em 0}
a{color:var(--accent);text-decoration-thickness:1px;text-underline-offset:3px}
blockquote{margin-left:0;padding:.15em 0 .15em 1.15em;border-left:3px solid var(--accent);color:var(--muted)}
code,pre{font-family:"SFMono-Regular","Cascadia Code",Consolas,"Noto Sans Mono CJK SC",monospace}
:not(pre)>code{padding:.14em .34em;border-radius:4px;background:var(--wash);font-size:.88em}
pre{overflow:auto;padding:1.15em 1.3em;border:1px solid var(--line);border-radius:9px;background:var(--wash);font-size:.88em;line-height:1.6}
.hljs-keyword,.hljs-selector-tag,.hljs-built_in,.hljs-type{color:#9a3e58;font-weight:600}
.hljs-string,.hljs-attr,.hljs-template-variable{color:#557548}
.hljs-number,.hljs-literal{color:#9a5d2d}
.hljs-comment,.hljs-quote{color:#8b857d;font-style:italic}
.hljs-title,.hljs-function .hljs-title{color:var(--accent)}
table{display:block;width:100%;overflow:auto;border-collapse:collapse}
th,td{padding:.52em .75em;border:1px solid var(--line);text-align:left}
th{background:var(--wash);font-weight:650}
img{display:block;max-width:100%;height:auto;margin:1.5em auto;border-radius:7px}
hr{margin:2.5em 0;border:0;border-top:1px solid var(--line)}
input[type=checkbox]{margin-right:.45em;accent-color:var(--accent)}
.contains-task-list{padding-left:1.25em}.task-list-item{list-style:none}
[data-footnotes]{margin-top:3em;padding-top:1em;border-top:1px solid var(--line);color:var(--muted);font-size:.9em}
.katex{font:inherit}.katex-html{display:none}.katex-mathml{display:inline}
.katex-display{display:block;overflow-x:auto;overflow-y:hidden;padding:.45em 0;text-align:center}
.katex-display .katex-mathml{display:block}
@media(max-width:700px){html{background:#fffefa}body{padding:38px 24px;box-shadow:none;font-size:16px}}
@media print{html{background:white}body{max-width:none;min-height:0;padding:0;box-shadow:none}}
`

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function documentTitle(path?: string): string {
  if (!path) return 'Qingshu document'
  const filename = path.split(/[\\/]/).at(-1) || path
  return filename.replace(/\.(?:md|markdown)$/i, '') || 'Qingshu document'
}

export async function createHtmlDocument(source: string, path?: string): Promise<string> {
  const body = await renderMarkdown(source)
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Qingshu">
<title>${escapeHtml(documentTitle(path))}</title>
<style>${exportStyles}</style>
</head>
<body>
${body}
</body>
</html>
`
}
