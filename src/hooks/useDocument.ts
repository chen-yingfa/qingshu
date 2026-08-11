import { useCallback, useReducer, useRef } from 'react'

export interface DocumentState {
  content: string
  path?: string
  dirty: boolean
  activeBlock: number
  error: string | null
  latestSaveRequest: number
  contentRevision: number
  sourceMode: boolean
  selection: EditorSelection
}

export interface EditorSelection {
  start: number
  end: number
  direction: 'forward' | 'backward' | 'none'
}

export interface DocumentTab extends DocumentState {
  id: string
}

export interface TabsState {
  tabs: DocumentTab[]
  activeTabId: string
}

export type DocumentAction =
  | { type: 'edit'; content: string }
  | { type: 'load'; content: string; path?: string; requestId: number }
  | { type: 'save-started'; requestId: number }
  | {
      type: 'saved'
      content: string
      path: string
      requestId: number
      contentRevision: number
    }
  | { type: 'save-error'; message: string; requestId: number }
  | { type: 'activate'; index: number }
  | { type: 'source-mode'; enabled: boolean }
  | { type: 'selection'; selection: EditorSelection }
  | { type: 'error'; message: string | null }

export const initialDocumentState: DocumentState = {
  content: '',
  dirty: false,
  activeBlock: 0,
  error: null,
  latestSaveRequest: 0,
  contentRevision: 0,
  sourceMode: false,
  selection: { start: 0, end: 0, direction: 'none' },
}

function createTab(
  id: string,
  state: Partial<DocumentState> = {},
): DocumentTab {
  return {
    ...initialDocumentState,
    ...state,
    selection: state.selection ?? { ...initialDocumentState.selection },
    id,
  }
}

function createInitialTabsState(sourceMode = false): TabsState {
  return {
    tabs: [createTab('tab-1', { sourceMode })],
    activeTabId: 'tab-1',
  }
}

export const initialTabsState: TabsState = createInitialTabsState()

export type TabsAction =
  | { type: 'new-tab'; id: string; sourceMode?: boolean }
  | {
      type: 'open-tab'
      id: string
      content: string
      path: string
      requestId: number
      sourceMode?: boolean
    }
  | { type: 'activate-tab'; tabId: string }
  | {
      type: 'close-tab'
      tabId: string
      defaultSourceMode?: boolean
      resetRevision?: number
    }
  | { type: 'document'; tabId: string; action: DocumentAction }

export function documentReducer(
  state: DocumentState,
  action: DocumentAction,
): DocumentState {
  switch (action.type) {
    case 'edit':
      return {
        ...state,
        content: action.content,
        dirty: true,
        error: null,
        contentRevision: state.contentRevision + 1,
      }
    case 'load':
      return {
        ...initialDocumentState,
        content: action.content,
        path: action.path,
        latestSaveRequest: action.requestId,
        contentRevision: state.contentRevision + 1,
        sourceMode: state.sourceMode,
      }
    case 'save-started':
      return { ...state, latestSaveRequest: action.requestId }
    case 'saved':
      if (action.requestId !== state.latestSaveRequest) return state
      return action.contentRevision === state.contentRevision &&
        action.content === state.content
        ? { ...state, path: action.path, dirty: false, error: null }
        : { ...state, path: action.path }
    case 'save-error':
      return action.requestId === state.latestSaveRequest
        ? { ...state, error: action.message }
        : state
    case 'activate':
      return { ...state, activeBlock: Math.max(0, action.index) }
    case 'source-mode':
      return { ...state, sourceMode: action.enabled }
    case 'selection':
      return { ...state, selection: action.selection }
    case 'error':
      return { ...state, error: action.message }
  }
}

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case 'new-tab':
      return {
        tabs: [
          ...state.tabs,
          createTab(action.id, { sourceMode: action.sourceMode ?? false }),
        ],
        activeTabId: action.id,
      }
    case 'open-tab': {
      const existing = state.tabs.find((tab) => tab.path === action.path)
      if (existing) return { ...state, activeTabId: existing.id }
      return {
        tabs: [
          ...state.tabs,
          createTab(action.id, {
            content: action.content,
            path: action.path,
            latestSaveRequest: action.requestId,
            contentRevision: 1,
            sourceMode: action.sourceMode ?? false,
          }),
        ],
        activeTabId: action.id,
      }
    }
    case 'activate-tab':
      return state.tabs.some((tab) => tab.id === action.tabId)
        ? { ...state, activeTabId: action.tabId }
        : state
    case 'close-tab': {
      const index = state.tabs.findIndex((tab) => tab.id === action.tabId)
      if (index < 0) return state
      if (state.tabs.length === 1) {
        return {
          tabs: [
            createTab(state.tabs[0].id, {
              sourceMode: action.defaultSourceMode ?? false,
              contentRevision:
                action.resetRevision ?? state.tabs[0].contentRevision + 1,
            }),
          ],
          activeTabId: state.tabs[0].id,
        }
      }
      const tabs = state.tabs.filter((tab) => tab.id !== action.tabId)
      const activeTabId =
        state.activeTabId === action.tabId
          ? tabs[Math.min(index, tabs.length - 1)].id
          : state.activeTabId
      return { tabs, activeTabId }
    }
    case 'document':
      return {
        ...state,
        tabs: state.tabs.map((tab) =>
          tab.id === action.tabId
            ? { ...documentReducer(tab, action.action), id: tab.id }
            : tab,
        ),
      }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function filename(path: string): string {
  return path.split(/[\\/]/).at(-1) || path
}

export type DocumentOperationResult =
  | { status: 'success'; path: string }
  | { status: 'warning'; path: string; message: string }
  | { status: 'canceled' }
  | { status: 'superseded'; path?: string; warning?: string }
  | { status: 'error'; message: string }

export function useDocument(defaultSourceMode = false) {
  const [tabsState, tabsDispatch] = useReducer(
    tabsReducer,
    defaultSourceMode,
    createInitialTabsState,
  )
  const requestId = useRef(0)
  const tabId = useRef(1)
  const contentRevisions = useRef(new Map<string, number>([['tab-1', 0]]))
  const latestSaveRequests = useRef(new Map<string, number>())
  const activeSaveTokens = useRef(new Map<string, Set<string>>())
  const tabLifetimes = useRef(new Map<string, number>([['tab-1', 0]]))
  const tabsRef = useRef(tabsState)
  const pathOwners = useRef(new Map<string, string>())
  const pathReservations = useRef(
    new Map<string, { ownerId: string; tokens: Set<symbol> }>(),
  )
  tabsRef.current = tabsState
  const dispatchTabs = useCallback((action: TabsAction) => {
    tabsRef.current = tabsReducer(tabsRef.current, action)
    tabsDispatch(action)
  }, [])
  const reservePath = useCallback((path: string, ownerId: string) => {
    const owner = pathOwners.current.get(path)
    const reservation = pathReservations.current.get(path)
    if (
      (owner !== undefined && owner !== ownerId) ||
      (reservation !== undefined && reservation.ownerId !== ownerId)
    ) {
      return null
    }
    const token = Symbol(path)
    if (reservation) reservation.tokens.add(token)
    else {
      pathReservations.current.set(path, {
        ownerId,
        tokens: new Set([token]),
      })
    }
    return token
  }, [])
  const releasePath = useCallback((path: string, token: symbol) => {
    const reservation = pathReservations.current.get(path)
    if (!reservation) return
    reservation.tokens.delete(token)
    if (reservation.tokens.size === 0) pathReservations.current.delete(path)
  }, [])
  const state =
    tabsState.tabs.find((tab) => tab.id === tabsState.activeTabId) ??
    tabsState.tabs[0]
  const dispatch = useCallback((action: DocumentAction) => {
    const activeTabId = tabsState.activeTabId
    if (action.type === 'edit' || action.type === 'load') {
      contentRevisions.current.set(
        activeTabId,
        (contentRevisions.current.get(activeTabId) ?? 0) + 1,
      )
    }
    dispatchTabs({ type: 'document', tabId: activeTabId, action })
  }, [dispatchTabs, tabsState.activeTabId])

  const newDocument = useCallback(() => {
    const id = `tab-${++tabId.current}`
    contentRevisions.current.set(id, 0)
    tabLifetimes.current.set(id, 0)
    dispatchTabs({ type: 'new-tab', id, sourceMode: defaultSourceMode })
  }, [defaultSourceMode, dispatchTabs])

  const openDocument = useCallback(async () => {
    try {
      const result = await window.qingshu.openFile()
      if (result.canceled) return { status: 'canceled' } as const
      const existingOwner = pathOwners.current.get(result.path)
      if (existingOwner) {
        dispatchTabs({ type: 'activate-tab', tabId: existingOwner })
        return { status: 'success', path: result.path } as const
      }
      const id = `tab-${tabId.current + 1}`
      const reservation = reservePath(result.path, id)
      if (!reservation) {
        const message = `${filename(result.path)} is already being saved or opened in another tab.`
        dispatchTabs({
          type: 'document',
          tabId: tabsRef.current.activeTabId,
          action: { type: 'error', message },
        })
        return { status: 'error', message } as const
      }
      tabId.current += 1
      contentRevisions.current.set(id, 1)
      tabLifetimes.current.set(id, 0)
      pathOwners.current.set(result.path, id)
      releasePath(result.path, reservation)
      dispatchTabs({
        type: 'open-tab',
        id,
        content: result.content ?? '',
        path: result.path,
        requestId: ++requestId.current,
        sourceMode: defaultSourceMode,
      })
      return { status: 'success', path: result.path } as const
    } catch (error) {
      const message = errorMessage(error)
      dispatchTabs({
        type: 'document',
        tabId: tabsRef.current.activeTabId,
        action: { type: 'error', message },
      })
      return { status: 'error', message } as const
    }
  }, [defaultSourceMode, dispatchTabs, releasePath, reservePath])

  const openRecentDocument = useCallback(async (path: string) => {
    try {
      const result = await window.qingshu.openRecentFile(path)
      const existingOwner = pathOwners.current.get(result.path)
      if (existingOwner) {
        dispatchTabs({ type: 'activate-tab', tabId: existingOwner })
        return { status: 'success', path: result.path } as const
      }
      const id = `tab-${tabId.current + 1}`
      const reservation = reservePath(result.path, id)
      if (!reservation) {
        const message = `${filename(result.path)} is already being saved or opened in another tab.`
        dispatchTabs({
          type: 'document',
          tabId: tabsRef.current.activeTabId,
          action: { type: 'error', message },
        })
        return { status: 'error', message } as const
      }
      tabId.current += 1
      contentRevisions.current.set(id, 1)
      tabLifetimes.current.set(id, 0)
      pathOwners.current.set(result.path, id)
      releasePath(result.path, reservation)
      dispatchTabs({
        type: 'open-tab',
        id,
        content: result.content ?? '',
        path: result.path,
        requestId: ++requestId.current,
        sourceMode: defaultSourceMode,
      })
      return { status: 'success', path: result.path } as const
    } catch (error) {
      const message = errorMessage(error)
      dispatchTabs({
        type: 'document',
        tabId: tabsRef.current.activeTabId,
        action: { type: 'error', message },
      })
      return { status: 'error', message } as const
    }
  }, [defaultSourceMode, dispatchTabs, releasePath, reservePath])

  const saveDocument = useCallback(
    async (saveAs = false) => {
      const activeTabId = tabsRef.current.activeTabId
      const origin = tabsRef.current.tabs.find((tab) => tab.id === activeTabId)
      if (!origin) {
        return { status: 'error', message: 'Document tab no longer exists.' } as const
      }
      const content = origin.content
      const originLifetime = tabLifetimes.current.get(activeTabId)
      const savedContentRevision =
        contentRevisions.current.get(activeTabId) ?? origin.contentRevision
      let savePath = origin.path
      if (saveAs || !savePath) {
        try {
          const selected = await window.qingshu.chooseSavePath()
          if (selected.canceled) return { status: 'canceled' } as const
          savePath = selected.path
        } catch (error) {
          const message = errorMessage(error)
          if (tabsRef.current.tabs.some((tab) => tab.id === activeTabId)) {
            dispatchTabs({
              type: 'document',
              tabId: activeTabId,
              action: { type: 'error', message },
            })
          }
          return { status: 'error', message } as const
        }
      }
      if (tabLifetimes.current.get(activeTabId) !== originLifetime) {
        return { status: 'superseded' } as const
      }
      const reservation = reservePath(savePath, activeTabId)
      if (!reservation) {
        const message = `${filename(savePath)} is already being saved or opened in another tab. Choose a different path.`
        if (tabsRef.current.tabs.some((tab) => tab.id === activeTabId)) {
          dispatchTabs({
            type: 'document',
            tabId: activeTabId,
            action: { type: 'error', message },
          })
        }
        return { status: 'error', message } as const
      }
      const currentRequest = ++requestId.current
      const saveToken = `${activeTabId}:${currentRequest}`
      const tabSaveTokens = activeSaveTokens.current.get(activeTabId) ?? new Set()
      tabSaveTokens.add(saveToken)
      activeSaveTokens.current.set(activeTabId, tabSaveTokens)
      latestSaveRequests.current.set(activeTabId, currentRequest)
      dispatchTabs({
        type: 'document',
        tabId: activeTabId,
        action: { type: 'save-started', requestId: currentRequest },
      })
      try {
        const result = await window.qingshu.saveFile({
          content,
          path: savePath,
          saveToken,
        })
        if (currentRequest !== latestSaveRequests.current.get(activeTabId)) {
          if (!result.canceled && result.warning) {
            return {
              status: 'superseded',
              path: result.path,
              warning: result.warning,
            } as const
          }
          return { status: 'superseded' } as const
        }
        if (result.canceled) return { status: 'canceled' } as const
        if (tabsRef.current.tabs.some((tab) => tab.id === activeTabId)) {
          if (
            origin.path &&
            origin.path !== result.path &&
            pathOwners.current.get(origin.path) === activeTabId
          ) {
            pathOwners.current.delete(origin.path)
          }
          pathOwners.current.set(result.path, activeTabId)
          dispatchTabs({
            type: 'document',
            tabId: activeTabId,
            action: {
              type: 'saved',
              content,
              path: result.path,
              requestId: currentRequest,
              contentRevision: savedContentRevision,
            },
          })
        }
        if (
          savedContentRevision !==
          (contentRevisions.current.get(activeTabId) ?? 0)
        ) {
          return {
            status: 'superseded',
            ...(result.warning
              ? { path: result.path, warning: result.warning }
              : {}),
          } as const
        }
        if (result.warning) {
          return {
            status: 'warning',
            path: result.path,
            message: result.warning,
          } as const
        }
        return { status: 'success', path: result.path } as const
      } catch (error) {
        const message = errorMessage(error)
        if (currentRequest !== latestSaveRequests.current.get(activeTabId)) {
          return { status: 'superseded' } as const
        }
        dispatchTabs({
          type: 'document',
          tabId: activeTabId,
          action: { type: 'save-error', message, requestId: currentRequest },
        })
        return { status: 'error', message } as const
      } finally {
        const remainingTokens = activeSaveTokens.current.get(activeTabId)
        remainingTokens?.delete(saveToken)
        if (remainingTokens?.size === 0) {
          activeSaveTokens.current.delete(activeTabId)
        }
        releasePath(savePath, reservation)
      }
    },
    [dispatchTabs, releasePath, reservePath],
  )

  const activateTab = useCallback((tabId: string) => {
    dispatchTabs({ type: 'activate-tab', tabId })
  }, [dispatchTabs])

  const cancelTabSaves = useCallback(async (tabId: string) => {
    const tokens = [...(activeSaveTokens.current.get(tabId) ?? [])]
    if (tokens.length === 0) return
    await Promise.all(tokens.map(token => window.qingshu.cancelSave(token)))
  }, [])

  const cancelAllSaves = useCallback(async () => {
    const tokens = [...activeSaveTokens.current.values()].flatMap(tokens => [
      ...tokens,
    ])
    await Promise.all(tokens.map(token => window.qingshu.cancelSave(token)))
  }, [])

  const closeTab = useCallback(async (tabId: string) => {
    const closing = tabsRef.current.tabs.find((tab) => tab.id === tabId)
    if (!closing) return
    const resetsOnlyTab = tabsRef.current.tabs.length === 1 && Boolean(closing)
    const resetRevision = resetsOnlyTab
      ? (contentRevisions.current.get(tabId) ?? closing.contentRevision) + 1
      : undefined
    const nextLifetime = (tabLifetimes.current.get(tabId) ?? 0) + 1
    tabLifetimes.current.set(tabId, nextLifetime)
    latestSaveRequests.current.delete(tabId)
    await cancelTabSaves(tabId)
    if (!tabsRef.current.tabs.some(tab => tab.id === tabId)) return
    if (closing?.path && pathOwners.current.get(closing.path) === tabId) {
      pathOwners.current.delete(closing.path)
    }
    dispatchTabs({
      type: 'close-tab',
      tabId,
      defaultSourceMode,
      resetRevision,
    })
    contentRevisions.current.delete(tabId)
    latestSaveRequests.current.delete(tabId)
    activeSaveTokens.current.delete(tabId)
    tabLifetimes.current.delete(tabId)
    if (resetsOnlyTab) {
      contentRevisions.current.set(tabId, resetRevision!)
      tabLifetimes.current.set(tabId, nextLifetime)
    }
  }, [cancelTabSaves, defaultSourceMode, dispatchTabs])

  return {
    state,
    dispatch,
    tabs: tabsState.tabs,
    activeTabId: tabsState.activeTabId,
    activateTab,
    cancelAllSaves,
    closeTab,
    newDocument,
    openDocument,
    openRecentDocument,
    saveDocument,
  }
}
