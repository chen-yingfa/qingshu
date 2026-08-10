import { describe, expect, it } from 'vitest'

import { documentReducer, initialDocumentState } from './useDocument'

describe('documentReducer', () => {
  it('marks edited content dirty and clears stale errors', () => {
    const state = documentReducer(
      { ...initialDocumentState, error: 'Save failed' },
      { type: 'edit', content: '# Revised' },
    )

    expect(state).toMatchObject({ content: '# Revised', dirty: true, error: null })
  })

  it('loads a file as a clean document with its first block active', () => {
    const state = documentReducer(
      { ...initialDocumentState, content: 'old', dirty: true, activeBlock: 4 },
      { type: 'load', content: '# Opened', path: '/notes/opened.md' },
    )

    expect(state).toMatchObject({
      content: '# Opened',
      path: '/notes/opened.md',
      dirty: false,
      activeBlock: 0,
    })
  })

  it('only marks the current content saved', () => {
    const edited = { ...initialDocumentState, content: 'new', dirty: true }

    expect(
      documentReducer(edited, {
        type: 'saved',
        content: 'stale',
        path: '/notes/stale.md',
      }),
    ).toEqual(edited)
    expect(
      documentReducer(edited, {
        type: 'saved',
        content: 'new',
        path: '/notes/new.md',
      }),
    ).toMatchObject({ dirty: false, path: '/notes/new.md' })
  })
})
