# File IO

> Note: This is not yet implemented

## Using `fs` module


To access the OS file system, we need to call the `fs` module in Node API, which is available to the renderer process after setting `nodeIntegration: true`. 

File IO is a part of global inputs, and is handled by the `App` component.

## Loading

Upon file opening, the input container is cleared, then the Editor creates a new InputBlock for each Markdown block in of the file (defined by an empty line), and pass the initial content to each InputBlock. The Editor then calls `renderToHtml` for each InputBlock to get the rendered HTML, and pass to the preview container.

> Note that the content that Editor passes to each InputBlock is only the initial content, all further content updates are handled by the InputBlock itself.

## Saving

Since all Markdown text is stored in the `content` of each InputBlock, the Editor can simply iterate through all InputBlocks and get the `content` of each one, then concatenate them together to get the final Markdown text, which is then saved to the file.

## Security Issues with `nodeIntegration`

> This is not implemented

Using `nodeIntegration: true` is [not safe](https://github.com/electron/electron/issues/9920). so we need to expose an API to the renderer process during preloading (in `electron/preload/index.ts`).