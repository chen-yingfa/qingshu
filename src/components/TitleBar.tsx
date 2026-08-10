import { Icon } from './Icons'

interface TitleBarProps {
  path?: string
  dirty: boolean
  onClose(): void
}

export function TitleBar({ path, dirty, onClose }: TitleBarProps) {
  const name = path?.split(/[\\/]/u).at(-1) ?? 'Untitled'
  const windowAction = (action: 'minimize' | 'toggle-maximize' | 'close') => {
    void window.qingshu.windowAction(action)
  }

  return (
    <header className="title-bar">
      <div className="brand-mark" aria-hidden="true">
        Q
      </div>
      <div className="document-title" title={path ?? 'Untitled document'}>
        {name}
        {dirty && <span className="dirty-indicator" aria-label="Unsaved changes" />}
      </div>
      <div className="window-controls">
        <button
          type="button"
          title="Minimize"
          aria-label="Minimize window"
          onClick={() => windowAction('minimize')}
        >
          <Icon name="minimize" />
        </button>
        <button
          type="button"
          title="Maximize or restore"
          aria-label="Maximize or restore window"
          onClick={() => windowAction('toggle-maximize')}
        >
          <Icon name="maximize" />
        </button>
        <button
          type="button"
          className="close-button"
          title="Close"
          aria-label="Close window"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
    </header>
  )
}
