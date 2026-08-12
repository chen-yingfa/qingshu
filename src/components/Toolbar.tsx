import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'

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

function useToolbarTooltip(label: string) {
  const id = `toolbar-tooltip-${useId().replace(/:/gu, '')}`
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const anchorRef = useRef<HTMLButtonElement | null>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const measure = useCallback(() => {
    const button = anchorRef.current
    const tooltip = tooltipRef.current
    if (!button || !tooltip) return
    const anchor = button.getBoundingClientRect()
    const dimensions = tooltip.getBoundingClientRect()
    const gap = 7
    const inset = 8
    const maxLeft = Math.max(inset, window.innerWidth - dimensions.width - inset)
    const left = Math.max(
      inset,
      Math.min(anchor.left + anchor.width / 2 - dimensions.width / 2, maxLeft),
    )
    const below = anchor.bottom + gap
    const top =
      below + dimensions.height <= window.innerHeight - inset
        ? below
        : Math.max(inset, anchor.top - gap - dimensions.height)
    setPosition({ left, top })
  }, [])
  const show = (button: HTMLButtonElement) => {
    anchorRef.current = button
    setVisible(true)
  }
  useLayoutEffect(() => {
    if (visible) measure()
  }, [measure, visible])
  useEffect(() => {
    if (!visible) return undefined
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [measure, visible])
  const tooltip = (
    <span
      ref={tooltipRef}
      id={id}
      role="tooltip"
      className="toolbar-tooltip"
      data-visible={visible}
      style={
        {
          '--tooltip-left': `${position.left}px`,
          '--tooltip-top': `${position.top}px`,
        } as CSSProperties
      }
    >
      {label}
    </span>
  )
  return {
    id,
    visible,
    tooltip,
    events: {
      onMouseEnter: (event: ReactMouseEvent<HTMLButtonElement>) =>
        show(event.currentTarget),
      onMouseLeave: () => setVisible(false),
      onFocus: (event: FocusEvent<HTMLButtonElement>) =>
        show(event.currentTarget),
      onBlur: () => setVisible(false),
    },
  }
}

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
  const tooltip = useToolbarTooltip(label)
  return (
    <button
      type="button"
      className={active ? 'tool-button is-active' : 'tool-button'}
      aria-label={label}
      aria-describedby={tooltip.visible ? tooltip.id : undefined}
      aria-pressed={active}
      onClick={onClick}
      {...tooltip.events}
    >
      <Icon name={icon} />
      {tooltip.tooltip}
    </button>
  )
}

export const Toolbar = memo(function Toolbar({
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
  const recentControlRef = useRef<HTMLDivElement>(null)
  const recentTriggerRef = useRef<HTMLButtonElement>(null)
  const recentMenuRef = useRef<HTMLDivElement>(null)
  const recentItemsRef = useRef<Array<HTMLButtonElement | null>>([])
  const recentTooltip = useToolbarTooltip('Recent files')

  useEffect(() => {
    if (!recentOpen) return undefined
    if (recentPaths.length > 0) recentItemsRef.current[0]?.focus()
    else recentMenuRef.current?.focus()
    const dismiss = (event: MouseEvent) => {
      if (!recentControlRef.current?.contains(event.target as Node)) {
        setRecentOpen(false)
      }
    }
    document.addEventListener('mousedown', dismiss)
    return () => document.removeEventListener('mousedown', dismiss)
  }, [recentOpen, recentPaths.length])

  const navigateRecent = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let target = index
    if (event.key === 'ArrowDown') target = (index + 1) % recentPaths.length
    else if (event.key === 'ArrowUp') {
      target = (index - 1 + recentPaths.length) % recentPaths.length
    } else if (event.key === 'Home') target = 0
    else if (event.key === 'End') target = recentPaths.length - 1
    else if (event.key === 'Escape') {
      event.preventDefault()
      setRecentOpen(false)
      recentTriggerRef.current?.focus()
      return
    } else return
    event.preventDefault()
    recentItemsRef.current[target]?.focus()
  }

  return (
    <nav className="toolbar" aria-label="Editor toolbar">
      <div className="tool-group file-tools">
        <ToolButton label="New document" icon="new" onClick={() => onFile('new')} />
        <ToolButton label="Open file" icon="open" onClick={() => onFile('open')} />
        <div className="recent-files-control" ref={recentControlRef}>
          <button
            ref={recentTriggerRef}
            type="button"
            className="tool-button recent-files-button"
            aria-label="Recent files"
            aria-describedby={recentTooltip.visible ? recentTooltip.id : undefined}
            aria-haspopup="menu"
            aria-expanded={recentOpen}
            onClick={() => setRecentOpen((open) => !open)}
            {...recentTooltip.events}
          >
            <span className="recent-files-icon" aria-hidden="true">↶</span>
            {recentTooltip.tooltip}
          </button>
          {recentOpen && (
            <div
              ref={recentMenuRef}
              className="recent-files-menu"
              role="menu"
              aria-label="Recent files"
              tabIndex={-1}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setRecentOpen(false)
                  recentTriggerRef.current?.focus()
                }
              }}
            >
              {recentPaths.length === 0 ? (
                <span className="recent-files-empty">No recent files</span>
              ) : (
                recentPaths.map((path, index) => (
                  <button
                    ref={(button) => {
                      recentItemsRef.current[index] = button
                    }}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    key={path}
                    title={path}
                    onClick={() => {
                      setRecentOpen(false)
                      onRecent(path)
                    }}
                    onKeyDown={(event) => navigateRecent(event, index)}
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
})
