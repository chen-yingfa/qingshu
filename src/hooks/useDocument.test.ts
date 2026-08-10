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
      {
        type: 'load',
        content: '# Opened',
        path: '/notes/opened.md',
        requestId: 1,
      },
    )

    expect(state).toMatchObject({
      content: '# Opened',
      path: '/notes/opened.md',
      dirty: false,
      activeBlock: 0,
    })
  })

  it('only marks the current content saved', () => {
    const edited = {
      ...initialDocumentState,
      content: 'new',
      dirty: true,
      latestSaveRequest: 2,
    }

    expect(
      documentReducer(edited, {
        type: 'saved',
        requestId: 2,
        content: 'stale',
        path: '/notes/stale.md',
      }),
    ).toEqual(edited)
    expect(
      documentReducer(edited, {
        type: 'saved',
        requestId: 2,
        content: 'new',
        path: '/notes/new.md',
      }),
    ).toMatchObject({ dirty: false, path: '/notes/new.md' })
  })

  it('never lets an older save response mark newer content saved', () => {
    const savingOld = documentReducer(
      { ...initialDocumentState, content: 'old', dirty: true },
      { type: 'save-started', requestId: 1 },
    )
    const edited = documentReducer(savingOld, {
      type: 'edit',
      content: 'newest',
    })
    const savingNewest = documentReducer(edited, {
      type: 'save-started',
      requestId: 2,
    })

    const staleResponse = documentReducer(savingNewest, {
      type: 'saved',
      requestId: 1,
      content: 'old',
      path: '/notes/note.md',
    })
    expect(staleResponse).toEqual(savingNewest)

    expect(
      documentReducer(staleResponse, {
        type: 'saved',
        requestId: 2,
        content: 'newest',
        path: '/notes/note.md',
      }),
    ).toMatchObject({
      content: 'newest',
      dirty: false,
      path: '/notes/note.md',
      latestSaveRequest: 2,
    })
  })
})
