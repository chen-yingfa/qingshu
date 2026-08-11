import { Icon } from './Icons'

interface TitleBarProps {
  path?: string
  dirty: boolean
  onClose(): void
}

export function TitleBar({ path, dirty, onClose }: TitleBarProps) {
  const name = path?.split(/[\\/]/u).at(-1) ?? 'Untitled'
  const usesNativeControls =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/u.test(navigator.platform)
  const windowAction = (action: 'minimize' | 'toggle-maximize' | 'close') => {
    void window.qingshu.windowAction(action)
  }

  return (
    <header
      className={
        usesNativeControls ? 'title-bar title-bar-native-mac' : 'title-bar'
      }
      style={
        usesNativeControls
          ? { gridTemplateColumns: '116px 1fr 116px' }
          : undefined
      }
    >
      <div
        className="brand-mark"
        aria-hidden="true"
        style={usesNativeControls ? { marginLeft: 82 } : undefined}
      >
        Q
      </div>
      <div className="document-title" title={path ?? 'Untitled document'}>
        {name}
        {dirty && <span className="dirty-indicator" aria-label="Unsaved changes" />}
      </div>
      {!usesNativeControls && <div className="window-controls">
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
      </div>}
    </header>
  )
}
