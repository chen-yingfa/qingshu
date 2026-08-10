import { useEffect, useState } from 'react'

import { documentStats } from '../markdown/cjk'

interface StatusBarProps {
  content: string
  error: string | null
  path?: string
  activeBlock: number
  dirty: boolean
}

export function StatusBar({
  content,
  error,
  path,
  activeBlock,
  dirty,
}: StatusBarProps) {
  const [stats, setStats] = useState(() => documentStats(content))

  useEffect(() => {
    const timer = window.setTimeout(() => setStats(documentStats(content)), 160)
    return () => window.clearTimeout(timer)
  }, [content])

  return (
    <footer className="status-bar">
      <span className={error ? 'status-message is-error' : 'status-message'}>
        {error ?? path ?? 'Local Markdown document'}
      </span>
      <span>Block {activeBlock + 1}</span>
      <span>{dirty ? 'Unsaved' : 'Saved'}</span>
      <div className="document-stats">
        <span>{stats.words.toLocaleString()} words</span>
        <span>{stats.characters.toLocaleString()} characters</span>
        <span>{stats.readingMinutes} min read</span>
      </div>
    </footer>
  )
}
