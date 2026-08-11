import { useCallback, useReducer, useRef } from 'react'

export interface DocumentState {
  content: string
  path?: string
  dirty: boolean
  activeBlock: number
  error: string | null
  latestSaveRequest: number
  contentRevision: number
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
  | { type: 'error'; message: string | null }

export const initialDocumentState: DocumentState = {
  content: '',
  dirty: false,
  activeBlock: 0,
  error: null,
  latestSaveRequest: 0,
  contentRevision: 0,
}

function createTab(id: string, state: Partial<DocumentState> = {}): DocumentTab {
  return { ...initialDocumentState, ...state, id }
}

export const initialTabsState: TabsState = {
  tabs: [createTab('tab-1')],
  activeTabId: 'tab-1',
}

export type TabsAction =
  | { type: 'new-tab'; id: string }
  | {
      type: 'open-tab'
      id: string
      content: string
      path: string
      requestId: number
    }
  | { type: 'activate-tab'; tabId: string }
  | { type: 'close-tab'; tabId: string }
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
        content: action.content,
        path: action.path,
        dirty: false,
        activeBlock: 0,
        error: null,
        latestSaveRequest: action.requestId,
        contentRevision: state.contentRevision + 1,
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
    case 'error':
      return { ...state, error: action.message }
  }
}

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case 'new-tab':
      return {
        tabs: [...state.tabs, createTab(action.id)],
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
          tabs: [createTab(state.tabs[0].id)],
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

export type DocumentOperationResult =
  | { status: 'success'; path: string }
  | { status: 'warning'; path: string; message: string }
  | { status: 'canceled' }
  | { status: 'superseded'; path?: string; warning?: string }
  | { status: 'error'; message: string }

export function useDocument() {
  const [tabsState, tabsDispatch] = useReducer(tabsReducer, initialTabsState)
  const requestId = useRef(0)
  const tabId = useRef(1)
  const contentRevisions = useRef(new Map<string, number>([['tab-1', 0]]))
  const latestSaveRequests = useRef(new Map<string, number>())
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
    tabsDispatch({ type: 'document', tabId: activeTabId, action })
  }, [tabsState.activeTabId])

  const newDocument = useCallback(() => {
    const id = `tab-${++tabId.current}`
    contentRevisions.current.set(id, 0)
    tabsDispatch({ type: 'new-tab', id })
  }, [])

  const openDocument = useCallback(async () => {
    try {
      const result = await window.qingshu.openFile()
      if (result.canceled) return { status: 'canceled' } as const
      const id = `tab-${++tabId.current}`
      contentRevisions.current.set(id, 1)
      tabsDispatch({
        type: 'open-tab',
        id,
        content: result.content ?? '',
        path: result.path,
        requestId: ++requestId.current,
      })
      return { status: 'success', path: result.path } as const
    } catch (error) {
      const message = errorMessage(error)
      tabsDispatch({
        type: 'document',
        tabId: tabsState.activeTabId,
        action: { type: 'error', message },
      })
      return { status: 'error', message } as const
    }
  }, [tabsState.activeTabId])

  const openRecentDocument = useCallback(async (path: string) => {
    try {
      const result = await window.qingshu.openRecentFile(path)
      const id = `tab-${++tabId.current}`
      contentRevisions.current.set(id, 1)
      tabsDispatch({
        type: 'open-tab',
        id,
        content: result.content ?? '',
        path: result.path,
        requestId: ++requestId.current,
      })
      return { status: 'success', path: result.path } as const
    } catch (error) {
      const message = errorMessage(error)
      tabsDispatch({
        type: 'document',
        tabId: tabsState.activeTabId,
        action: { type: 'error', message },
      })
      return { status: 'error', message } as const
    }
  }, [tabsState.activeTabId])

  const saveDocument = useCallback(
    async (saveAs = false) => {
      const activeTabId = tabsState.activeTabId
      const content = state.content
      const savedContentRevision =
        contentRevisions.current.get(activeTabId) ?? state.contentRevision
      const currentRequest = ++requestId.current
      latestSaveRequests.current.set(activeTabId, currentRequest)
      tabsDispatch({
        type: 'document',
        tabId: activeTabId,
        action: { type: 'save-started', requestId: currentRequest },
      })
      try {
        const result = await window.qingshu.saveFile({
          content,
          path: saveAs ? undefined : state.path,
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
        tabsDispatch({
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
        tabsDispatch({
          type: 'document',
          tabId: activeTabId,
          action: { type: 'save-error', message, requestId: currentRequest },
        })
        return { status: 'error', message } as const
      }
    },
    [state.content, state.contentRevision, state.path, tabsState.activeTabId],
  )

  const activateTab = useCallback((tabId: string) => {
    tabsDispatch({ type: 'activate-tab', tabId })
  }, [])

  const closeTab = useCallback((tabId: string) => {
    tabsDispatch({ type: 'close-tab', tabId })
    contentRevisions.current.delete(tabId)
    latestSaveRequests.current.delete(tabId)
  }, [])

  return {
    state,
    dispatch,
    tabs: tabsState.tabs,
    activeTabId: tabsState.activeTabId,
    activateTab,
    closeTab,
    newDocument,
    openDocument,
    openRecentDocument,
    saveDocument,
  }
}
