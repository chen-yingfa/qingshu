# Qingshu

A modern, minimalistic Markdown editor for Windows, implemented in Vue + Electron + TypeScript.

## Why Another Markdown Editor?

Because none of the existing markdown editors satisfy all of the following:

- Minimalistic: no knowledge base, no zettelkasten, no fancy syntax sugar that are not compatible with other editors.
- Support Windows: I use Windows, and I don't want to buy a Mac.
- Free of charge and open source.
- Modern and minimalistic UI
- Support GitHub Flavored Markdown + LaTeX (including inline math).
- Can export (beautiful looking) PDF
  - It should support syntax highlighting for code, footnotes, etc.
  - Markdown PDF extension for VSCode is not my cup of tea.
- Few bugs (MarkText is too buggy for me)
- Better support for CJK characters
  - Automatically predict whether to use CJK quotation marks (full width) instead of ordinary ones (half width).
  - Correctly perform word segmentation when moving cursor while holding down CTRL.
  - Can automatically add space between CJK and latin letters for more appealing text.
- WYSIWYG

### Compared To Existing Editors

- Typora:
  - Not open-source
  - Not free of charge
  - Poor support of CJK characters
  - No command palette.
- Obsidian
  - Not open-source
  - Not minimalistic
  - Use knowledge base (with software-custom syntax)
  - Notes must exist inside specified folders.
- MarkText
  - Too buggy
  - Too large
  - Poor support for CJK characters
  - No longer maintained.
- Notion (and most Notion-like software):
  - Not a markdown editor
  - Not open-source
  - Support too much non-markdown features.
- VSCode: 
  - Not all features are supported (eg. pasting image, creating tables, etc. although you can install extensions to support it)
  - Not really WYSIWYG
  - Poor support for CJK characters
  - Too large if you only want to edit a markdown file
  - Does not support common markdown hotkeys (eg. for bold and italic font).

## Features

- Live preview
- Math rendering with MathJax

## Upcoming Features

- Save and open file.
- Chinese README
- Support GitHub Flavored Markdown.
- Acrylic/Mica material and Fluent design.
- Export HTML
- Export PDF
- Command palette
