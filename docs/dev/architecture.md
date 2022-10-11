# Project Architecture

This document describes the architecture of the project. It is intended to be 
viewed by developers who want to understand the source code.

## Overview

The architecture of components:

```mermaid
flowchart TD
    App --> TitleBar
    App --> Editor
    App --> StatusBar
    Editor --> block1[InputBlock 1]
    Editor --> block2[InputBlock 2]
    Editor --> block3[InputBlock 3]
```

## Editor and Input Blocks

The Editor and InputBlock are the main components of this project. Their location:

- Editor: `src/components/Editor.vue`
- InputBlock: `src/components/InputBlock.vue`

An InputBlock is a Vue component (`InputBlock.vue`), each of them manages a div element in the input container, in which user can enter text. The text content is also managed by the InputBlock, and upon request (by the Editor), InputBlocks communicate with the Renderer directly to render the text content into string of HTML, which is then passed to the Editor for it to show in the preview container.

The Editor (`Editor.vue`) is a container around both the **input container** and **preview container** (both are a div element). It manages all logic and states that exceeds the scope of each input block, such as the creation, deletion and reordering of input blocks.

Relationship between Editor and InputBlock:

```mermaid
flowchart TD
    subgraph Editor
        subgraph Input Container
            block1[InputBlock 1]
            block2[InputBlock 2]
        end
        subgraph Preview Container
            html1[HTML 1]
            html2[HTML 2]
        end
        block1 --Render--> html1
        block2 --Render--> html2
    end
```


### Handling User Inputs

```mermaid
flowchart LR
    subgraph User Inputs
        global_inputs(Global inputs)
        local_inputs(Local inputs)
    end
    subgraph Editor
        subgraph InputBlock1
            div1[div] -.- content1[Markdown text]
        end
        preview_container[Preview container]
    end
    App --> Editor
    global_inputs --> App
    local_inputs --> div1
    content1 -->|Render Result| preview_container
```


Each InputBlock is responsible for managing its own text content, which is the `innerText` of the contenteditable div in which the user inputs. When inputting markdown text, it triggers HTML listeners (with `keydown` and `keyup` etc.), so content update are handled by the InputBlocks internally, and anything that exceeds the scope of an InputBlock, will cause it to emit an event to the Editor.

The Editor should not manipulate the `content` of the InputBlock. Instead, when it needs to render and update the preview container, it should call the `renderToHtml` method of InputBlock to get the rendered HTML string, which is then passed to the preview container.

### Block Management: Instantiation, Deletion, Reordering

InputBlocks are managed by the Editor in the `blocks` array.

```html
<div id="input-container">
    <InputBlock v-for="block in blocks" 
        ref="inputBlocks" 
        :key="block.id"
        :type="block.type"
        :id="block.id"
        :initContent="block.initContent"
        <!-- event listeners -->
        />
</div>
```

Note that the Editor passes the following properties to each InputBlock:

- 1 built-in property: `:key`
- 3 custom properties: `id`, `type` and `initContent`.

Any changes to these properties will cause the InputBlock to re-render. 

Note that that `blocks` array only stores an Object containing the 3 properties, and *not* the actual InputBlock components, which is accessed through `this.$refs.inputBlock`. The former is a data member of the Editor, and the latter is a reference to the InputBlock components in the template DOM. Also, `v-for` will render the InputBlock in the order of the `blocks` array, but when accessing the actual InputBlock components through `this.$refs.inputBlocks`, the order is determined by the `:key` property, which is the `id` of the InputBlock.

**Instantiation**: We need to ensure that other blocks are not re-rendered, so none of the InputBlock's prop should be changed. We create a new block Object, and insert it into `blocks` with `splice`.

**Deletion**: We just remove the corresponding block Object from `blocks` with `splice`.

**Reordering**: We just reorder the elements in `blocks`.

## File IO

> Note: This section is not yet implemented.

### File Loading

Upon file opening, the input container is cleared, then the Editor creates a new InputBlock for each Markdown block in of the file (defined by an empty line), and pass the initial content to each InputBlock. The Editor then calls `renderToHtml` for each InputBlock to get the rendered HTML, and pass to the preview container.

> Note that the content that Editor passes to each InputBlock is only the initial content, all further content updates are handled by the InputBlock itself.

### File Saving

Since all Markdown text is stored in the `content` of each InputBlock, the Editor can simply iterate through all InputBlocks and get the `content` of each one, then concatenate them together to get the final Markdown text, which is then saved to the file.


## Global State Management

Vue's event emission does not bubble, and some states in our app is shared by multiple components, like data about caret position, word count, etc. But we still want Vue's reactivity, so we store all global states in `src/assets/js/store.ts`. Components that use any shared global states should import from this file.
