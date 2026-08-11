// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { QingshuApi } from '../types/electron'
import { useDocument } from './useDocument'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useDocument save lifecycle', () => {
  it('preserves the configured source mode when resetting the only tab', () => {
    const { result } = renderHook(() => useDocument(true))
    expect(result.current.state.sourceMode).toBe(true)

    act(() => result.current.closeTab('tab-1'))

    expect(result.current.state.sourceMode).toBe(true)
  })

  it('uses canonical path selection before an ordinary Save on an untitled tab', async () => {
    const chooseSavePath = vi.fn().mockResolvedValue({
      canceled: false,
      path: '/notes/ordinary-save.md',
    })
    const saveFile = vi.fn().mockResolvedValue({
      canceled: false,
      path: '/notes/ordinary-save.md',
    })
    window.qingshu = {
      chooseSavePath,
      saveFile,
    } as unknown as QingshuApi
    const { result } = renderHook(() => useDocument())
    act(() => result.current.dispatch({ type: 'edit', content: '# Draft' }))

    await act(async () => {
      await result.current.saveDocument()
    })

    expect(chooseSavePath).toHaveBeenCalledOnce()
    expect(saveFile).toHaveBeenCalledWith({
      content: '# Draft',
      path: '/notes/ordinary-save.md',
    })
  })

  it('atomically reserves an overlapping Save As path for exactly one tab', async () => {
    let finishWinner!: (value: {
      canceled: false
      path: string
    }) => void
    const saveFile = vi.fn(
      () =>
        new Promise<{ canceled: false; path: string }>((resolve) => {
          finishWinner = resolve
        }),
    )
    window.qingshu = {
      chooseSavePath: vi.fn().mockResolvedValue({
        canceled: false,
        path: '/notes/shared.md',
      }),
      saveFile,
    } as unknown as QingshuApi
    const { result } = renderHook(() => useDocument())
    act(() => result.current.dispatch({ type: 'edit', content: '# First' }))
    act(() => result.current.newDocument())
    act(() => result.current.dispatch({ type: 'edit', content: '# Second' }))

    let secondSave!: ReturnType<typeof result.current.saveDocument>
    act(() => {
      secondSave = result.current.saveDocument(true)
    })
    act(() => result.current.activateTab('tab-1'))
    let firstSave!: ReturnType<typeof result.current.saveDocument>
    act(() => {
      firstSave = result.current.saveDocument(true)
    })

    await waitFor(() => expect(saveFile).toHaveBeenCalledOnce())
    expect(saveFile).toHaveBeenCalledWith({
      content: '# Second',
      path: '/notes/shared.md',
    })
    await expect(firstSave).resolves.toEqual({
      status: 'error',
      message:
        'shared.md is already being saved or opened in another tab. Choose a different path.',
    })
    finishWinner({ canceled: false, path: '/notes/shared.md' })
    await act(async () => {
      await secondSave
    })

    expect(
      result.current.tabs.filter((tab) => tab.path === '/notes/shared.md'),
    ).toHaveLength(1)
    const loser = result.current.tabs.find((tab) => tab.id === 'tab-1')
    expect(loser).toMatchObject({
      content: '# First',
      dirty: true,
    })
    expect(loser?.path).toBeUndefined()
    expect(result.current.tabs.find((tab) => tab.id === 'tab-2')).toMatchObject({
      content: '# Second',
      dirty: false,
      path: '/notes/shared.md',
    })
  })

  it('does not write a selected path after its originating tab closes', async () => {
    let finishSelection!: (value: {
      canceled: false
      path: string
    }) => void
    const saveFile = vi.fn()
    window.qingshu = {
      chooseSavePath: vi.fn(
        () =>
          new Promise((resolve) => {
            finishSelection = resolve
          }),
      ),
      saveFile,
    } as unknown as QingshuApi
    const { result } = renderHook(() => useDocument())
    act(() => result.current.newDocument())
    act(() => result.current.dispatch({ type: 'edit', content: '# Closing' }))

    let save!: ReturnType<typeof result.current.saveDocument>
    act(() => {
      save = result.current.saveDocument(true)
    })
    act(() => result.current.closeTab('tab-2'))
    finishSelection({ canceled: false, path: '/notes/closed.md' })

    await expect(save).resolves.toEqual({ status: 'superseded' })
    expect(saveFile).not.toHaveBeenCalled()
  })

  it('cancels an in-flight save before removing a discarded tab', async () => {
    let finishSave!: (value: { canceled: false; path: string }) => void
    let finishCancellation!: () => void
    const cancelSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishCancellation = resolve
        }),
    )
    window.qingshu = {
      chooseSavePath: vi.fn().mockResolvedValue({
        canceled: false,
        path: '/notes/discarded.md',
      }),
      saveFile: vi.fn(
        () =>
          new Promise((resolve) => {
            finishSave = resolve
          }),
      ),
      cancelSave,
    } as unknown as QingshuApi
    const { result } = renderHook(() => useDocument())
    act(() => result.current.newDocument())
    act(() => result.current.dispatch({ type: 'edit', content: '# Discard' }))

    let save!: ReturnType<typeof result.current.saveDocument>
    act(() => {
      save = result.current.saveDocument()
    })
    await waitFor(() => expect(window.qingshu.saveFile).toHaveBeenCalledOnce())
    const request = vi.mocked(window.qingshu.saveFile).mock.calls[0][0]
    let close!: Promise<void>
    act(() => {
      close = result.current.closeTab('tab-2')
    })

    expect(cancelSave).toHaveBeenCalledWith(request.saveToken)
    expect(result.current.tabs.some((tab) => tab.id === 'tab-2')).toBe(true)
    finishCancellation()
    await act(async () => {
      await close
    })
    expect(result.current.tabs.some((tab) => tab.id === 'tab-2')).toBe(false)

    finishSave({ canceled: false, path: '/notes/discarded.md' })
    await expect(save).resolves.toEqual({ status: 'superseded' })
  })

  it('deduplicates simultaneous opens before allocating tab resources', async () => {
    window.qingshu = {
      openFile: vi.fn().mockResolvedValue({
        canceled: false,
        path: '/notes/concurrent.md',
        content: '# Concurrent',
      }),
    } as unknown as QingshuApi
    const { result } = renderHook(() => useDocument())

    await act(async () => {
      await Promise.all([
        result.current.openDocument(),
        result.current.openDocument(),
      ])
    })
    act(() => result.current.newDocument())

    expect(result.current.tabs.map((tab) => tab.id)).toEqual([
      'tab-1',
      'tab-2',
      'tab-3',
    ])
  })

  it('keeps newer dirty content when duplicate Open overlaps a pending Save', async () => {
    let finishSave!: (value: { canceled: false; path: string }) => void
    let finishOpen!: (value: {
      canceled: false
      path: string
      content: string
    }) => void
    window.qingshu = {
      openFile: vi.fn()
        .mockResolvedValueOnce({
          canceled: false,
          path: '/notes/overlap.md',
          content: '# Initial',
        })
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finishOpen = resolve
            }),
        ),
      saveFile: vi.fn(
        () =>
          new Promise((resolve) => {
            finishSave = resolve
          }),
      ),
    } as unknown as QingshuApi
    const { result } = renderHook(() => useDocument())
    await act(async () => {
      await result.current.openDocument()
    })
    act(() => result.current.dispatch({ type: 'edit', content: '# Save A' }))

    let save!: ReturnType<typeof result.current.saveDocument>
    act(() => {
      save = result.current.saveDocument()
    })
    await waitFor(() => expect(window.qingshu.saveFile).toHaveBeenCalledOnce())
    act(() => result.current.dispatch({ type: 'edit', content: '# Save B' }))

    let duplicateOpen!: ReturnType<typeof result.current.openDocument>
    act(() => {
      duplicateOpen = result.current.openDocument()
    })
    finishSave({ canceled: false, path: '/notes/overlap.md' })
    finishOpen({
      canceled: false,
      path: '/notes/overlap.md',
      content: '# Save A',
    })
    await act(async () => {
      await Promise.all([save, duplicateOpen])
    })

    expect(result.current.tabs).toHaveLength(2)
    expect(result.current.state).toMatchObject({
      path: '/notes/overlap.md',
      content: '# Save B',
      dirty: true,
    })
  })

  it('does not consume tab IDs or revision entries for duplicate opens', async () => {
    window.qingshu = {
      openFile: vi.fn().mockResolvedValue({
        canceled: false,
        path: '/notes/same.md',
        content: '# Same',
      }),
    } as unknown as QingshuApi
    const { result } = renderHook(() => useDocument())

    await act(async () => {
      await result.current.openDocument()
    })
    await act(async () => {
      await result.current.openDocument()
    })
    act(() => result.current.newDocument())

    expect(result.current.tabs.map((tab) => tab.id)).toEqual([
      'tab-1',
      'tab-2',
      'tab-3',
    ])
  })

  it.each([false, true])(
    'preserves both tab buffers when Save As collides with a %s dirty owner',
    async (ownerDirty) => {
      const saveFile = vi.fn()
      window.qingshu = {
        openFile: vi.fn().mockResolvedValue({
          canceled: false,
          path: '/notes/existing.md',
          content: '# Existing',
        }),
        chooseSavePath: vi.fn().mockResolvedValue({
          canceled: false,
          path: '/notes/existing.md',
        }),
        saveFile,
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
        message:
          'existing.md is already being saved or opened in another tab. Choose a different path.',
      })
      expect(saveFile).not.toHaveBeenCalled()
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
    window.qingshu = {
      chooseSavePath: vi.fn().mockResolvedValue({
        canceled: false,
        path: '/notes/selected.md',
      }),
      saveFile,
    } as unknown as QingshuApi
    const { result } = renderHook(() => useDocument())

    act(() => result.current.dispatch({ type: 'edit', content: 'first draft' }))
    let save!: ReturnType<typeof result.current.saveDocument>
    act(() => {
      save = result.current.saveDocument(true)
    })
    act(() => result.current.dispatch({ type: 'edit', content: 'newest draft' }))
    await act(async () => {
      await Promise.resolve()
    })
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
      chooseSavePath: vi.fn().mockResolvedValue({
        canceled: false,
        path: '/notes/reverted.md',
      }),
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
    await act(async () => {
      await Promise.resolve()
    })
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
      chooseSavePath: vi.fn().mockResolvedValue({
        canceled: false,
        path: '/notes/warning.md',
      }),
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
      chooseSavePath: vi.fn().mockResolvedValue({
        canceled: false,
        path: '/notes/warning.md',
      }),
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
    await act(async () => {
      await Promise.resolve()
    })
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
      chooseSavePath: vi.fn().mockResolvedValue({
        canceled: false,
        path: '/notes/older.md',
      }),
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
    await act(async () => {
      await Promise.resolve()
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
