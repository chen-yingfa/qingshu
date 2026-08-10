import { documentStats } from '../markdown/cjk'

interface StatusBarProps {
  content: string
  error: string | null
  path?: string
}

export function StatusBar({ content, error, path }: StatusBarProps) {
  const stats = documentStats(content)

  return (
    <footer className="status-bar" aria-live="polite">
      <span className={error ? 'status-message is-error' : 'status-message'}>
        {error ?? path ?? 'Local Markdown document'}
      </span>
      <div className="document-stats">
        <span>{stats.words.toLocaleString()} words</span>
        <span>{stats.characters.toLocaleString()} characters</span>
        <span>{stats.readingMinutes} min read</span>
      </div>
    </footer>
  )
}
