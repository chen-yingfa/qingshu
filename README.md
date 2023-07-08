# 轻书 Qingshu

一个现代的，简约的 Markdown 编辑器给 Windows，基于 Vue + Electron + TypeScript。

## 为何再一个 Markdown 编辑器？

因为现有编辑器没有一个符合一下所有要求：

- 简约：不要知识库、zettelkasten 等无法导出纯 Markdown 的功能。
- 支持 Windows。
- 开源。
- 现代且简约的用户界面。
- 支持 GitHub Flavored Markdown + LaTeX（包括行内公式）。
- 导出（好看的）PDF。
  - 代码高亮、脚注等。
  - VSCode 的 Markdown PDF 插件太丑了。
- bug 少（MarkText 太多 bug 了）
- 中文友好。
  - 自动转换 Markdown 语句对应的「中文字符」：
    - 比如，输入 `》[space]`、`￥{something}￥`、`·{something}·`，应自动转换成 `>[space]`, `${something}$`、`` `{something}` ``.
  - 自动判断是否用全角引号。
  - 具有中文分词能力，按下 CTRL 时移动光标和双击文字时应该能正确选中一个中文词。
  - 可以自动在汉字和拉丁文字之间添加空格。
  - 等宽字符中，中文英文可以对齐。
- 支持 Marp/Slidev。
- 所见即所得。

### 跟主流编辑器的比较

要求：支持 Windows，是免费。

| 软件      | 开源 | 中文友好 | 导出 PDF | 轻  | Bug 少 | A4 预览 | 代码友好 | GFM |
| ----      | ---- | -------- | -------- | --- | ------ | ------- | -------- | --- |
| Typora    | ❌   |    ❌    |          |     |        |  ❌     |          |   |
| Obsidian  | ❌   |    ❌    |          |     |        |  ❌     |          | ❌ |
| MarkText  |      |    ❌    |          |     | ❌     |  ❌     |          | ❌ |
| VSCode    |      |    ❌    |  插件    | ❌  |        |  ❌     |          | 插件 |
| Notion    | ❌   |    ❌    |    ❌    | ❌  |        |  ❌     |     ❌   | ❌ |
| Zettlr    |      |    ❌    |          |     |  ❌    |  ❌     |          |    |

> 值得注意的是，很多导出的 PDF 都巨丑，而且没有 A4 预览的话，其实严格来说都不算是所见即所得。


### 关于主流编辑器的更多细节

- Typora:
  - Not open-source.
  - Not free of charge.
  - Poor support of CJK characters.
  - No command palette.
- Obsidian
  - Not open-source.
  - Not minimalistic.
  - Use knowledge base (with software-custom syntax).
  - Notes must exist inside specified folders.
- MarkText
  - Too buggy and large.
  - Poor support for CJK characters.
  - No longer maintained.
- Notion (and most Notion-like software):
  - Not a markdown editor.
  - Not open-source.
  - Support too much non-markdown features.
  - Poor support of code, CJK characters, etc.
  - No custom styling.
  - PDF export is ugly.
- VSCode: 
  - Not all features are supported (eg. inline math, pasting image, table manipulation, etc. although you can install extensions to support it).
  - Not really WYSIWYG.
  - Poor support for CJK characters (word segmentation and alignment of half-width and full-width monospace characters)
  - Too large if you only want to edit a markdown file.

## 功能

- 实时渲染，所见即所得。
- 支持 GFM 和 KaTeX。

## 计划功能

- Acrylic/Mica material 和 Fluent 设计.
- 导出 HTML
- 导出 PDF
- 命令面板
