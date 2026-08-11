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
  const dialogRef = useRef<HTMLElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const reactId = useId()
  const listId = `command-list-${reactId.replace(/[^a-zA-Z0-9_-]/gu, '-')}`
  const filtered = useMemo(
    () => fuzzyFilterCommands(commands, query),
    [commands, query],
  )

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    inputRef.current?.focus()
    return () => {
      const previous = previousFocusRef.current
      if (previous?.isConnected) previous.focus()
    }
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
        ref={dialogRef}
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            onDismiss()
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const direction = event.key === 'ArrowDown' ? 1 : -1
            setSelectedIndex((index) =>
              filtered.length ? (index + direction + filtered.length) % filtered.length : 0,
            )
            inputRef.current?.focus()
          } else if (event.key === 'Enter') {
            event.preventDefault()
            execute(filtered[selectedIndex])
          } else if (event.key === 'Tab') {
            const controls = Array.from(
              dialogRef.current?.querySelectorAll<HTMLElement>(
                'input:not([disabled]),button:not([disabled]),[tabindex]:not([tabindex="-1"])',
              ) ?? [],
            )
            const first = controls[0]
            const last = controls.at(-1)
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault()
              last?.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault()
              first?.focus()
            }
          }
        }}
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
            aria-haspopup="listbox"
            aria-autocomplete="list"
            aria-controls={listId}
            aria-activedescendant={
              filtered[selectedIndex]
                ? `${listId}-option-${selectedIndex}`
                : undefined
            }
            autoComplete="off"
            spellCheck={false}
            placeholder="Type a command…"
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-divider" />
        <div className="command-list" id={listId} role="listbox">
          {filtered.length ? (
            filtered.map((command, index) => (
              <button
                key={command.id}
                id={`${listId}-option-${index}`}
                className={index === selectedIndex ? 'command-item is-selected' : 'command-item'}
                type="button"
                role="option"
                aria-label={
                  command.shortcut ? `${command.label}, ${command.shortcut}` : command.label
                }
                aria-selected={index === selectedIndex}
                onMouseMove={() => setSelectedIndex(index)}
                onFocus={() => setSelectedIndex(index)}
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
