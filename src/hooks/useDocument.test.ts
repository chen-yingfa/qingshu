import { describe, expect, it } from 'vitest'

import {
  documentReducer,
  initialDocumentState,
  initialTabsState,
  tabsReducer,
} from './useDocument'

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
      contentRevision: 1,
    }

    expect(
      documentReducer(edited, {
        type: 'saved',
        requestId: 2,
        content: 'stale',
        path: '/notes/stale.md',
        contentRevision: 0,
      }),
    ).toMatchObject({ dirty: true, path: '/notes/stale.md' })
    expect(
      documentReducer(edited, {
        type: 'saved',
        requestId: 2,
        content: 'new',
        path: '/notes/new.md',
        contentRevision: 1,
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
      contentRevision: 0,
    })
    expect(staleResponse).toEqual(savingNewest)

    expect(
      documentReducer(staleResponse, {
        type: 'saved',
        requestId: 2,
        content: 'newest',
        path: '/notes/note.md',
        contentRevision: 1,
      }),
    ).toMatchObject({
      content: 'newest',
      dirty: false,
      path: '/notes/note.md',
      latestSaveRequest: 2,
    })
  })
})

describe('tabsReducer', () => {
  it('keeps content, path, dirty state, active block, revision, errors, and save state independent', () => {
    const firstId = initialTabsState.activeTabId
    const withSecond = tabsReducer(initialTabsState, {
      type: 'new-tab',
      id: 'tab-2',
    })
    const editedSecond = tabsReducer(withSecond, {
      type: 'document',
      tabId: 'tab-2',
      action: { type: 'edit', content: '# Second' },
    })
    const activatedSecond = tabsReducer(editedSecond, {
      type: 'document',
      tabId: 'tab-2',
      action: { type: 'activate', index: 3 },
    })
    const erroredSecond = tabsReducer(activatedSecond, {
      type: 'document',
      tabId: 'tab-2',
      action: { type: 'save-error', message: 'Disk full', requestId: 0 },
    })

    expect(erroredSecond.tabs.find((tab) => tab.id === firstId)).toMatchObject({
      content: '',
      dirty: false,
      activeBlock: 0,
      contentRevision: 0,
      error: null,
      latestSaveRequest: 0,
    })
    expect(erroredSecond.tabs.find((tab) => tab.id === 'tab-2')).toMatchObject({
      content: '# Second',
      dirty: true,
      activeBlock: 3,
      contentRevision: 1,
      error: 'Disk full',
      latestSaveRequest: 0,
    })
  })

  it('activates an existing canonical path instead of adding a duplicate tab', () => {
    const opened = tabsReducer(initialTabsState, {
      type: 'open-tab',
      id: 'opened',
      content: '# Existing',
      path: '/real/note.md',
      requestId: 1,
    })
    const duplicate = tabsReducer(opened, {
      type: 'open-tab',
      id: 'duplicate',
      content: '# Read again',
      path: '/real/note.md',
      requestId: 2,
    })

    expect(duplicate.tabs).toHaveLength(2)
    expect(duplicate.activeTabId).toBe('opened')
    expect(duplicate.tabs.at(-1)?.content).toBe('# Existing')
  })

  it('closes a tab, activates its neighbor, and always leaves one tab', () => {
    const firstId = initialTabsState.activeTabId
    const withSecond = tabsReducer(initialTabsState, {
      type: 'new-tab',
      id: 'tab-2',
    })
    const closed = tabsReducer(withSecond, { type: 'close-tab', tabId: 'tab-2' })
    const closedLast = tabsReducer(closed, { type: 'close-tab', tabId: firstId })

    expect(closed.tabs.map((tab) => tab.id)).toEqual([firstId])
    expect(closed.activeTabId).toBe(firstId)
    expect(closedLast.tabs).toHaveLength(1)
    expect(closedLast.tabs[0]).toMatchObject({ content: '', dirty: false })
  })
})
