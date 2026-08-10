import type { FormatCommand } from './LiveEditor'
import { Icon, type IconName } from './Icons'

interface ToolbarProps {
  dark: boolean
  focus: boolean
  a4: boolean
  autoSpacing: boolean
  onFile(command: 'new' | 'open' | 'save' | 'save-as' | 'export-html' | 'export-pdf'): void
  onFormat(command: FormatCommand): void
  onToggle(option: 'dark' | 'focus' | 'a4' | 'spacing'): void
}

const formats: Array<[FormatCommand, IconName, string]> = [
  ['heading', 'heading', 'Heading'],
  ['bold', 'bold', 'Bold'],
  ['italic', 'italic', 'Italic'],
  ['link', 'link', 'Link'],
  ['code', 'code', 'Inline code'],
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
  onFile,
  onFormat,
  onToggle,
}: ToolbarProps) {
  return (
    <nav className="toolbar" aria-label="Editor toolbar">
      <div className="tool-group file-tools">
        <ToolButton label="New document" icon="new" onClick={() => onFile('new')} />
        <ToolButton label="Open file" icon="open" onClick={() => onFile('open')} />
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
        <ToolButton
          label="Toggle automatic CJK spacing"
          icon="spacing"
          active={autoSpacing}
          onClick={() => onToggle('spacing')}
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
      </div>
    </nav>
  )
}
