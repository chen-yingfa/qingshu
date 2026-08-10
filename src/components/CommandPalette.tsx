import { useEffect, useId, useMemo, useRef, useState } from 'react'

export interface PaletteCommand {
  id: string
  label: string
  shortcut?: string
  keywords: string[]
  run(): void | Promise<void>
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().normalize('NFKC')
}

function fuzzyScore(value: string, query: string): number | undefined {
  const haystack = normalize(value)
  const needle = normalize(query).replace(/\s+/g, '')
  if (!needle) return 0

  const compact = haystack.replace(/\s+/g, '')
  const exactIndex = compact.indexOf(needle)
  if (exactIndex >= 0) return exactIndex === 0 ? 1000 - needle.length : 800 - exactIndex

  let lastIndex = -1
  let gap = 0
  for (const character of needle) {
    const nextIndex = compact.indexOf(character, lastIndex + 1)
    if (nextIndex < 0) return undefined
    if (lastIndex >= 0) gap += nextIndex - lastIndex - 1
    lastIndex = nextIndex
  }
  return 500 - gap - lastIndex
}

export function fuzzyFilterCommands(
  commands: PaletteCommand[],
  query: string,
): PaletteCommand[] {
  const tokens = normalize(query).trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return commands

  return commands
    .map((command, index) => {
      const labelScores = tokens.map((token) => fuzzyScore(command.label, token))
      const keywordScores = tokens.map((token) =>
        Math.max(
          ...command.keywords.map((keyword) => fuzzyScore(keyword, token) ?? -Infinity),
        ),
      )
      const scores = labelScores.map((labelScore, tokenIndex) =>
        Math.max(
          labelScore === undefined ? -Infinity : labelScore + 300,
          keywordScores[tokenIndex] - 100,
        ),
      )
      return scores.some((score) => !Number.isFinite(score))
        ? undefined
        : { command, index, score: scores.reduce((total, score) => total + score, 0) }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ command }) => command)
}

interface CommandPaletteProps {
  commands: PaletteCommand[]
  onDismiss(): void
}

export function CommandPalette({ commands, onDismiss }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const filtered = useMemo(
    () => fuzzyFilterCommands(commands, query),
    [commands, query],
  )

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const execute = (command: PaletteCommand | undefined) => {
    if (!command) return
    onDismiss()
    void command.run()
  }

  return (
    <div
      className="palette-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDismiss()
      }}
    >
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="palette-search">
          <span className="palette-search-icon" aria-hidden="true">
            ⌕
          </span>
          <input
            ref={inputRef}
            value={query}
            role="combobox"
            aria-label="Search commands"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls={listId}
            aria-activedescendant={
              filtered[selectedIndex] ? `${listId}-${filtered[selectedIndex].id}` : undefined
            }
            autoComplete="off"
            spellCheck={false}
            placeholder="Type a command…"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                onDismiss()
              } else if (event.key === 'ArrowDown') {
                event.preventDefault()
                setSelectedIndex((index) =>
                  filtered.length ? (index + 1) % filtered.length : 0,
                )
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setSelectedIndex((index) =>
                  filtered.length ? (index - 1 + filtered.length) % filtered.length : 0,
                )
              } else if (event.key === 'Enter') {
                event.preventDefault()
                execute(filtered[selectedIndex])
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-divider" />
        <div className="command-list" id={listId} role="listbox">
          {filtered.length ? (
            filtered.map((command, index) => (
              <button
                key={command.id}
                id={`${listId}-${command.id}`}
                className={index === selectedIndex ? 'command-item is-selected' : 'command-item'}
                type="button"
                role="option"
                aria-label={
                  command.shortcut ? `${command.label}, ${command.shortcut}` : command.label
                }
                aria-selected={index === selectedIndex}
                onMouseMove={() => setSelectedIndex(index)}
                onClick={() => execute(command)}
              >
                <span>{command.label}</span>
                {command.shortcut && <kbd>{command.shortcut}</kbd>}
              </button>
            ))
          ) : (
            <p className="palette-empty">No matching commands</p>
          )}
        </div>
        <footer className="palette-hint" aria-hidden="true">
          <span>↑↓ Navigate</span>
          <span>↵ Run</span>
        </footer>
      </section>
    </div>
  )
}
