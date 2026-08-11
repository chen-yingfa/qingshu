// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { QingshuApi } from '../types/electron'
import { useDocument } from './useDocument'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useDocument save lifecycle', () => {
  it.each([false, true])(
    'preserves both tab buffers when Save As collides with a %s dirty owner',
    async (ownerDirty) => {
      window.qingshu = {
        openFile: vi.fn().mockResolvedValue({
          canceled: false,
          path: '/notes/existing.md',
          content: '# Existing',
        }),
        saveFile: vi
          .fn()
          .mockRejectedValue(
            new Error('The selected file is already open in another tab.'),
          ),
      } as unknown as QingshuApi
      const { result } = renderHook(() => useDocument())
      await act(async () => {
        await result.current.openDocument()
      })
      if (ownerDirty) {
        act(() =>
          result.current.dispatch({ type: 'edit', content: '# Existing dirty' }),
        )
      }
      act(() => result.current.newDocument())
      act(() =>
        result.current.dispatch({ type: 'edit', content: '# Conflicting draft' }),
      )

      let operation!: Awaited<ReturnType<typeof result.current.saveDocument>>
      await act(async () => {
        operation = await result.current.saveDocument(true)
      })

      expect(operation).toEqual({
        status: 'error',
        message: 'The selected file is already open in another tab.',
      })
      expect(result.current.tabs).toHaveLength(3)
      expect(
        result.current.tabs.find((tab) => tab.path === '/notes/existing.md'),
      ).toMatchObject({
        content: ownerDirty ? '# Existing dirty' : '# Existing',
        dirty: ownerDirty,
      })
      expect(result.current.state).toMatchObject({
        content: '# Conflicting draft',
        dirty: true,
      })
      expect(result.current.state.path).toBeUndefined()
    },
  )

  it('supersedes a Save As response after an edit while adopting its authorized path', async () => {
    let finishSave!: (result: {
      canceled: false
      path: string
    }) => void
    const saveFile = vi.fn(
      () =>
        new Promise<{ canceled: false; path: string }>((resolve) => {
          finishSave = resolve
        }),
    )
    window.qingshu = { saveFile } as unknown as QingshuApi
    const { result } = renderHook(() => useDocument())

    act(() => result.current.dispatch({ type: 'edit', content: 'first draft' }))
    let save!: ReturnType<typeof result.current.saveDocument>
    act(() => {
      save = result.current.saveDocument(true)
    })
    act(() => result.current.dispatch({ type: 'edit', content: 'newest draft' }))
    finishSave({ canceled: false, path: '/notes/selected.md' })

    let operation: Awaited<typeof save>
    await act(async () => {
      operation = await save
    })

    expect(operation!).toEqual({ status: 'superseded' })
    expect(result.current.state).toMatchObject({
      content: 'newest draft',
      path: '/notes/selected.md',
      dirty: true,
    })
  })

  it('supersedes a save after an edit even when content is reverted byte-for-byte', async () => {
    let finishSave!: (result: { canceled: false; path: string }) => void
    window.qingshu = {
      saveFile: vi.fn(
        () =>
          new Promise((resolve) => {
            finishSave = resolve
          }),
      ),
    } as unknown as QingshuApi
    const { result } = renderHook(() => useDocument())
    act(() => result.current.dispatch({ type: 'edit', content: 'same text' }))
    let save!: ReturnType<typeof result.current.saveDocument>
    act(() => {
      save = result.current.saveDocument()
    })
    act(() => result.current.dispatch({ type: 'edit', content: 'temporary edit' }))
    act(() => result.current.dispatch({ type: 'edit', content: 'same text' }))
    finishSave({ canceled: false, path: '/notes/reverted.md' })

    let operation: Awaited<typeof save>
    await act(async () => {
      operation = await save
    })

    expect(operation!).toEqual({ status: 'superseded' })
    expect(result.current.state).toMatchObject({
      content: 'same text',
      path: '/notes/reverted.md',
      dirty: true,
    })
  })

  it('reports a committed save with a durability warning as clean', async () => {
    window.qingshu = {
      saveFile: vi.fn().mockResolvedValue({
        canceled: false,
        path: '/notes/warning.md',
        warning: 'Saved, but directory sync failed.',
      }),
    } as unknown as QingshuApi
    const { result } = renderHook(() => useDocument())
    act(() => result.current.dispatch({ type: 'edit', content: 'draft' }))

    let operation!: Awaited<ReturnType<typeof result.current.saveDocument>>
    await act(async () => {
      operation = await result.current.saveDocument()
    })

    expect(operation).toEqual({
      status: 'warning',
      path: '/notes/warning.md',
      message: 'Saved, but directory sync failed.',
    })
    expect(result.current.state).toMatchObject({
      path: '/notes/warning.md',
      dirty: false,
    })
  })

  it('preserves a durability warning when an edit supersedes the save', async () => {
    let finishSave!: (result: {
      canceled: false
      path: string
      warning: string
    }) => void
    window.qingshu = {
      saveFile: vi.fn(
        () =>
          new Promise((resolve) => {
            finishSave = resolve
          }),
      ),
    } as unknown as QingshuApi
    const { result } = renderHook(() => useDocument())
    act(() => result.current.dispatch({ type: 'edit', content: 'first draft' }))
    let save!: ReturnType<typeof result.current.saveDocument>
    act(() => {
      save = result.current.saveDocument(true)
    })
    act(() => result.current.dispatch({ type: 'edit', content: 'newest draft' }))
    finishSave({
      canceled: false,
      path: '/notes/warning.md',
      warning: 'Saved, but directory sync failed.',
    })

    let operation: Awaited<typeof save>
    await act(async () => {
      operation = await save
    })

    expect(operation!).toEqual({
      status: 'superseded',
      path: '/notes/warning.md',
      warning: 'Saved, but directory sync failed.',
    })
    expect(result.current.state).toMatchObject({
      content: 'newest draft',
      path: '/notes/warning.md',
      dirty: true,
    })
  })

  it('preserves an older save warning after a newer request is canceled', async () => {
    let finishOlder!: (result: {
      canceled: false
      path: string
      warning: string
    }) => void
    let finishNewer!: (result: { canceled: true }) => void
    window.qingshu = {
      saveFile: vi.fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finishOlder = resolve
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finishNewer = resolve
            }),
        ),
    } as unknown as QingshuApi
    const { result } = renderHook(() => useDocument())
    act(() => result.current.dispatch({ type: 'edit', content: 'draft' }))

    let older!: ReturnType<typeof result.current.saveDocument>
    let newer!: ReturnType<typeof result.current.saveDocument>
    act(() => {
      older = result.current.saveDocument(true)
      newer = result.current.saveDocument(true)
    })
    finishNewer({ canceled: true })
    await act(async () => {
      await newer
    })
    finishOlder({
      canceled: false,
      path: '/notes/older.md',
      warning: 'Saved, but directory sync failed.',
    })

    let operation: Awaited<typeof older>
    await act(async () => {
      operation = await older
    })

    expect(operation!).toEqual({
      status: 'superseded',
      path: '/notes/older.md',
      warning: 'Saved, but directory sync failed.',
    })
    expect(result.current.state).toMatchObject({
      content: 'draft',
      dirty: true,
    })
  })
})
