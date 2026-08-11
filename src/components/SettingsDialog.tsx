import { useEffect, useMemo, useRef, useState } from 'react'

import {
  SHORTCUT_ACTIONS,
  eventToShortcut,
  loadSettings,
  shortcutLabel,
  type AppSettings,
  type ShortcutAction,
} from '../settings'

interface SettingsDialogProps {
  settings: AppSettings
  onChange(settings: AppSettings): void
  onDismiss(): void
}

export function SettingsDialog({
  settings,
  onChange,
  onDismiss,
}: SettingsDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const [shortcutConflict, setShortcutConflict] = useState<{
    id: ShortcutAction
    message: string
  } | null>(null)
  const isMac = /Mac|iPhone|iPad/u.test(navigator.platform)
  const duplicates = useMemo(() => {
    const owners = new Map<string, ShortcutAction[]>()
    for (const { id } of SHORTCUT_ACTIONS) {
      const shortcut = settings.shortcuts[id]
      const effective = shortcutLabel(shortcut, isMac)
      if (effective) {
        owners.set(effective, [...(owners.get(effective) ?? []), id])
      }
    }
    return new Set(
      [...owners.entries()]
        .filter(([, actions]) => actions.length > 1)
        .map(([shortcut]) => shortcut),
    )
  }, [isMac, settings.shortcuts])

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    dialogRef.current?.querySelector<HTMLElement>('select,input,button')?.focus()
    return () => {
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus()
    }
  }, [])

  const update = (patch: Partial<AppSettings>) => {
    setShortcutConflict(null)
    onChange({ ...settings, ...patch })
  }
  const updateShortcut = (id: ShortcutAction, shortcut: string) => {
    const owner = SHORTCUT_ACTIONS.find(
      (action) =>
        action.id !== id &&
        shortcut &&
        shortcutLabel(settings.shortcuts[action.id], isMac) ===
          shortcutLabel(shortcut, isMac),
    )
    if (owner) {
      setShortcutConflict({
        id,
        message: `${shortcutLabel(shortcut, isMac)} is already assigned to ${owner.label}`,
      })
      return
    }
    setShortcutConflict(null)
    onChange({
      ...settings,
      shortcuts: { ...settings.shortcuts, [id]: shortcut },
    })
  }

  return (
    <div
      className="settings-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDismiss()
      }}
    >
      <section
        ref={dialogRef}
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onDismiss()
          } else if (event.key === 'Tab') {
            const controls = Array.from(
              dialogRef.current?.querySelectorAll<HTMLElement>(
                'input:not([disabled]),select:not([disabled]),button:not([disabled])',
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
        <header className="settings-header">
          <div>
            <h2>Settings</h2>
            <p>Editor defaults and keyboard shortcuts</p>
          </div>
          <button
            type="button"
            className="settings-close"
            aria-label="Close settings"
            onClick={onDismiss}
          >
            ×
          </button>
        </header>

        <div className="settings-scroll">
          <fieldset className="settings-section">
            <legend>Editor defaults</legend>
            <label className="settings-field">
              <span>Color theme</span>
              <select
                aria-label="Default color theme"
                value={settings.theme}
                onChange={(event) =>
                  update({
                    theme: event.target.value as AppSettings['theme'],
                  })
                }
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label className="settings-field">
              <span>Document font</span>
              <select
                aria-label="Settings document font"
                value={settings.font}
                onChange={(event) =>
                  update({ font: event.target.value as AppSettings['font'] })
                }
              >
                <option value="sans">Sans</option>
                <option value="serif">Serif</option>
                <option value="mono">Monospace</option>
              </select>
            </label>
            <label className="settings-field">
              <span>Font size</span>
              <span className="settings-number">
                <input
                  type="number"
                  min={12}
                  max={32}
                  step={1}
                  aria-label="Document font size"
                  value={settings.fontSize}
                  onChange={(event) =>
                    update({
                      fontSize: Math.min(
                        32,
                        Math.max(12, Number(event.target.value) || 17),
                      ),
                    })
                  }
                />
                px
              </span>
            </label>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={settings.defaultA4}
                onChange={(event) =>
                  update({ defaultA4: event.target.checked })
                }
              />
              Use A4 preview by default
            </label>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={settings.autoSpacing}
                onChange={(event) =>
                  update({ autoSpacing: event.target.checked })
                }
              />
              Automatic CJK/Latin spacing
            </label>
          </fieldset>

          <fieldset className="settings-section">
            <legend>Keyboard shortcuts</legend>
            <p className="settings-help">
              Focus a shortcut field and press a combination. Delete clears it.
            </p>
            <div className="shortcut-list">
              {SHORTCUT_ACTIONS.map(({ id, label }) => {
                const shortcut = settings.shortcuts[id]
                return (
                  <label className="shortcut-row" key={id}>
                    <span>{label}</span>
                    <span>
                      <input
                        readOnly
                        aria-label={`Shortcut for ${label}`}
                        value={shortcutLabel(shortcut, isMac)}
                        className={
                          duplicates.has(shortcutLabel(shortcut, isMac)) ||
                          shortcutConflict?.id === id
                            ? 'has-conflict'
                            : ''
                        }
                        aria-invalid={
                          duplicates.has(shortcutLabel(shortcut, isMac))
                        }
                        aria-describedby={
                          duplicates.has(shortcutLabel(shortcut, isMac)) ||
                          shortcutConflict?.id === id
                            ? `shortcut-conflict-${id}`
                            : undefined
                        }
                        placeholder="Unassigned"
                        onKeyDown={(event) => {
                          if (event.key === 'Tab' || event.key === 'Escape') {
                            return
                          }
                          event.preventDefault()
                          event.stopPropagation()
                          if (
                            event.key === 'Backspace' ||
                            event.key === 'Delete'
                          ) {
                            updateShortcut(id, '')
                            return
                          }
                          const recorded = eventToShortcut(event)
                          if (recorded) updateShortcut(id, recorded)
                        }}
                      />
                      {(duplicates.has(shortcutLabel(shortcut, isMac)) ||
                        shortcutConflict?.id === id) && (
                        <small id={`shortcut-conflict-${id}`} role="alert">
                          {shortcutConflict?.id === id
                            ? shortcutConflict.message
                            : 'Already assigned'}
                        </small>
                      )}
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>
        </div>

        <footer className="settings-footer">
          <button
            type="button"
            onClick={() => {
              setShortcutConflict(null)
              onChange(loadSettings(null))
            }}
          >
            Reset defaults
          </button>
          <button type="button" className="settings-done" onClick={onDismiss}>
            Done
          </button>
        </footer>
      </section>
    </div>
  )
}
