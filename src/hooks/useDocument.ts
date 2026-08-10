import { useCallback, useReducer } from 'react'

export interface DocumentState {
  content: string
  path?: string
  dirty: boolean
  activeBlock: number
  error: string | null
}

export type DocumentAction =
  | { type: 'edit'; content: string }
  | { type: 'load'; content: string; path?: string }
  | { type: 'saved'; content: string; path: string }
  | { type: 'activate'; index: number }
  | { type: 'error'; message: string | null }

export const initialDocumentState: DocumentState = {
  content: '',
  dirty: false,
  activeBlock: 0,
  error: null,
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
      }
    case 'saved':
      return action.content === state.content
        ? { ...state, path: action.path, dirty: false, error: null }
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

export function useDocument() {
  const [state, dispatch] = useReducer(documentReducer, initialDocumentState)

  const newDocument = useCallback(() => {
    dispatch({ type: 'load', content: '' })
  }, [])

  const openDocument = useCallback(async () => {
    try {
      const result = await window.qingshu.openFile()
      if (!result.canceled) {
        dispatch({
          type: 'load',
          content: result.content ?? '',
          path: result.path,
        })
      }
    } catch (error) {
      dispatch({ type: 'error', message: errorMessage(error) })
    }
  }, [])

  const saveDocument = useCallback(
    async (saveAs = false) => {
      const content = state.content
      try {
        const result = await window.qingshu.saveFile({
          content,
          path: saveAs ? undefined : state.path,
        })
        if (!result.canceled) {
          dispatch({ type: 'saved', content, path: result.path })
        }
      } catch (error) {
        dispatch({ type: 'error', message: errorMessage(error) })
      }
    },
    [state.content, state.path],
  )

  return { state, dispatch, newDocument, openDocument, saveDocument }
}
