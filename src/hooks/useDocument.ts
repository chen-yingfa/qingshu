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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export type DocumentOperationResult =
  | { status: 'success'; path: string }
  | { status: 'warning'; path: string; message: string }
  | { status: 'canceled' }
  | { status: 'superseded' }
  | { status: 'error'; message: string }

export function useDocument() {
  const [state, baseDispatch] = useReducer(documentReducer, initialDocumentState)
  const requestId = useRef(0)
  const contentRevision = useRef(0)
  const dispatch = useCallback((action: DocumentAction) => {
    if (action.type === 'edit' || action.type === 'load') {
      contentRevision.current += 1
    }
    baseDispatch(action)
  }, [])

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
      const savedContentRevision = contentRevision.current
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
          contentRevision: savedContentRevision,
        })
        if (savedContentRevision !== contentRevision.current) {
          return { status: 'superseded' } as const
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
