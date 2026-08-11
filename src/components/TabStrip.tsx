import { type KeyboardEvent, useEffect, useRef } from 'react'

import type { DocumentTab } from '../hooks/useDocument'

function tabName(tab: DocumentTab): string {
  return tab.path?.split(/[\\/]/).at(-1) || 'Untitled'
}

interface TabStripProps {
  tabs: DocumentTab[]
  activeTabId: string
  orientation: 'horizontal' | 'vertical'
  onActivate(tabId: string): void
  onClose(tabId: string): void
}

export function TabStrip({
  tabs,
  activeTabId,
  orientation,
  onActivate,
  onClose,
}: TabStripProps) {
  const pendingClose = useRef<string | null>(null)

  useEffect(() => {
    const closed = pendingClose.current
    if (!closed || tabs.some((tab) => tab.id === closed)) return
    pendingClose.current = null
    document.getElementById(`document-tab-${activeTabId}`)?.focus()
  }, [activeTabId, tabs])

  const navigate = (event: KeyboardEvent, index: number) => {
    const previousKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp'
    const nextKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown'
    let target = index
    if (event.key === previousKey) target = (index - 1 + tabs.length) % tabs.length
    else if (event.key === nextKey) target = (index + 1) % tabs.length
    else if (event.key === 'Home') target = 0
    else if (event.key === 'End') target = tabs.length - 1
    else return
    event.preventDefault()
    onActivate(tabs[target].id)
    document.getElementById(`document-tab-${tabs[target].id}`)?.focus()
  }

  return (
    <div
      className={`tab-strip tab-strip-${orientation}`}
      role="tablist"
      aria-label="Open documents"
      aria-orientation={orientation}
    >
      {tabs.map((tab, index) => {
        const name = tabName(tab)
        const accessibleName = `${name}${tab.dirty ? ', unsaved' : ''}`
        return (
          <div className="document-tab-wrap" key={tab.id}>
            <button
              id={`document-tab-${tab.id}`}
              type="button"
              role="tab"
              className="document-tab"
              aria-label={accessibleName}
              aria-selected={tab.id === activeTabId}
              aria-controls={
                tab.id === activeTabId
                  ? `document-panel-${tab.id}`
                  : undefined
              }
              tabIndex={tab.id === activeTabId ? 0 : -1}
              onClick={() => onActivate(tab.id)}
              onKeyDown={(event) => navigate(event, index)}
            >
              <span className="document-tab-label">{name}</span>
              {tab.dirty && <span className="document-tab-dirty" aria-hidden="true">●</span>}
            </button>
            <button
              type="button"
              className="document-tab-close"
              aria-label={`Close ${name}`}
              tabIndex={tab.id === activeTabId ? 0 : -1}
              onClick={() => {
                pendingClose.current = tab.id
                onClose(tab.id)
              }}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
