import { useState } from 'react'

import type { DocumentFont } from '../settings'
import type { FormatCommand } from './LiveEditor'
import { Icon, type IconName } from './Icons'

export type { DocumentFont } from '../settings'

interface ToolbarProps {
  dark: boolean
  focus: boolean
  a4: boolean
  autoSpacing: boolean
  sourceMode: boolean
  documentFont: DocumentFont
  recentPaths: string[]
  onFile(command: 'new' | 'open' | 'save' | 'save-as' | 'export-html' | 'export-pdf'): void
  onFormat(command: FormatCommand): void
  onFontChange(font: DocumentFont): void
  onSettings(): void
  onRecent(path: string): void
  onToggle(option: 'dark' | 'focus' | 'a4' | 'spacing' | 'source'): void
}

const formats: Array<[FormatCommand, IconName, string]> = [
  ['heading', 'heading', 'Heading'],
  ['bold', 'bold', 'Bold'],
  ['italic', 'italic', 'Italic'],
  ['link', 'link', 'Link'],
  ['code', 'code', 'Inline code'],
  ['math', 'math', 'Inline math'],
  ['quote', 'quote', 'Block quote'],
  ['unordered-list', 'list', 'Bullet list'],
]

function ToolButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string
  icon: IconName
  active?: boolean
  onClick(): void
}) {
  return (
    <button
      type="button"
      className={active ? 'tool-button is-active' : 'tool-button'}
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  )
}

export function Toolbar({
  dark,
  focus,
  a4,
  autoSpacing,
  sourceMode,
  documentFont,
  recentPaths,
  onFile,
  onFormat,
  onFontChange,
  onSettings,
  onRecent,
  onToggle,
}: ToolbarProps) {
  const [recentOpen, setRecentOpen] = useState(false)
  return (
    <nav className="toolbar" aria-label="Editor toolbar">
      <div className="tool-group file-tools">
        <ToolButton label="New document" icon="new" onClick={() => onFile('new')} />
        <ToolButton label="Open file" icon="open" onClick={() => onFile('open')} />
        <div className="recent-files-control">
          <button
            type="button"
            className="tool-button recent-files-button"
            aria-label="Recent files"
            aria-haspopup="menu"
            aria-expanded={recentOpen}
            onClick={() => setRecentOpen((open) => !open)}
          >
            <span aria-hidden="true">↶</span>
          </button>
          {recentOpen && (
            <div className="recent-files-menu" role="menu" aria-label="Recent files">
              {recentPaths.length === 0 ? (
                <span className="recent-files-empty">No recent files</span>
              ) : (
                recentPaths.map((path) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={path}
                    title={path}
                    onClick={() => {
                      setRecentOpen(false)
                      onRecent(path)
                    }}
                  >
                    {path.split(/[\\/]/).at(-1) || path}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <ToolButton label="Save" icon="save" onClick={() => onFile('save')} />
        <ToolButton
          label="Save as"
          icon="download"
          onClick={() => onFile('save-as')}
        />
      </div>
      <span className="tool-separator" />
      <div className="tool-group format-tools">
        {formats.map(([command, icon, label]) => (
          <ToolButton
            key={command}
            label={label}
            icon={icon}
            onClick={() => onFormat(command)}
          />
        ))}
      </div>
      <span className="toolbar-spacer" />
      <div className="tool-group view-tools">
        <label className="font-picker">
          <span>Font</span>
          <select
            aria-label="Document font"
            value={documentFont}
            onChange={(event) => onFontChange(event.target.value as DocumentFont)}
          >
            <option value="sans">Sans</option>
            <option value="serif">Serif</option>
            <option value="mono">Monospace</option>
          </select>
        </label>
        <ToolButton
          label="Toggle automatic CJK spacing"
          icon="spacing"
          active={autoSpacing}
          onClick={() => onToggle('spacing')}
        />
        <ToolButton
          label="Toggle source mode"
          icon="source"
          active={sourceMode}
          onClick={() => onToggle('source')}
        />
        <ToolButton
          label="Toggle A4 preview"
          icon="page"
          active={a4}
          onClick={() => onToggle('a4')}
        />
        <ToolButton
          label="Toggle focus mode"
          icon="focus"
          active={focus}
          onClick={() => onToggle('focus')}
        />
        <ToolButton
          label="Toggle color theme"
          icon="sun"
          active={dark}
          onClick={() => onToggle('dark')}
        />
        <ToolButton
          label="Settings"
          icon="settings"
          onClick={onSettings}
        />
      </div>
    </nav>
  )
}
