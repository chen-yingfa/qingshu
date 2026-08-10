import { useCallback, useReducer, useRef } from 'react'

export interface DocumentState {
  content: string
  path?: string
  dirty: boolean
  activeBlock: number
  error: string | null
  latestSaveRequest: number
}

export type DocumentAction =
  | { type: 'edit'; content: string }
  | { type: 'load'; content: string; path?: string; requestId: number }
  | { type: 'save-started'; requestId: number }
  | { type: 'saved'; content: string; path: string; requestId: number }
  | { type: 'save-error'; message: string; requestId: number }
  | { type: 'activate'; index: number }
  | { type: 'error'; message: string | null }

export const initialDocumentState: DocumentState = {
  content: '',
  dirty: false,
  activeBlock: 0,
  error: null,
  latestSaveRequest: 0,
}

export function documentReducer(
  state: DocumentState,
  action: DocumentAction,
): DocumentState {
  switch (action.type) {
    case 'edit':
      return { ...state, content: action.content, dirty: true, error: null }
    case 'load':
      return {
        content: action.content,
        path: action.path,
        dirty: false,
        activeBlock: 0,
        error: null,
        latestSaveRequest: action.requestId,
      }
    case 'save-started':
      return { ...state, latestSaveRequest: action.requestId }
    case 'saved':
      return action.requestId === state.latestSaveRequest &&
        action.content === state.content
        ? { ...state, path: action.path, dirty: false, error: null }
        : state
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export type DocumentOperationResult =
  | { status: 'success'; path: string }
  | { status: 'canceled' }
  | { status: 'superseded' }
  | { status: 'error'; message: string }

export function useDocument() {
  const [state, dispatch] = useReducer(documentReducer, initialDocumentState)
  const requestId = useRef(0)

  const newDocument = useCallback(() => {
    dispatch({ type: 'load', content: '', requestId: ++requestId.current })
  }, [])

  const openDocument = useCallback(async () => {
    try {
      const result = await window.qingshu.openFile()
      if (result.canceled) return { status: 'canceled' } as const
      dispatch({
        type: 'load',
        content: result.content ?? '',
        path: result.path,
        requestId: ++requestId.current,
      })
      return { status: 'success', path: result.path } as const
    } catch (error) {
      const message = errorMessage(error)
      dispatch({ type: 'error', message })
      return { status: 'error', message } as const
    }
  }, [])

  const saveDocument = useCallback(
    async (saveAs = false) => {
      const content = state.content
      const currentRequest = ++requestId.current
      dispatch({ type: 'save-started', requestId: currentRequest })
      try {
        const result = await window.qingshu.saveFile({
          content,
          path: saveAs ? undefined : state.path,
        })
        if (currentRequest !== requestId.current) {
          return { status: 'superseded' } as const
        }
        if (result.canceled) return { status: 'canceled' } as const
        dispatch({
          type: 'saved',
          content,
          path: result.path,
          requestId: currentRequest,
        })
        return { status: 'success', path: result.path } as const
      } catch (error) {
        const message = errorMessage(error)
        if (currentRequest !== requestId.current) {
          return { status: 'superseded' } as const
        }
        dispatch({ type: 'save-error', message, requestId: currentRequest })
        return { status: 'error', message } as const
      }
    },
    [state.content, state.path],
  )

  return { state, dispatch, newDocument, openDocument, saveDocument }
}
