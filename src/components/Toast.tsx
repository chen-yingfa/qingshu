import { useEffect } from 'react'

export interface ToastMessage {
  id: number
  tone: 'success' | 'warning' | 'error'
  message: string
  action?: {
    label: string
    onClick(): void
  }
}

interface ToastProps {
  toast: ToastMessage
  duration: number
  onDismiss(id: number): void
}

function Toast({ toast, duration, onDismiss }: ToastProps) {
  useEffect(() => {
    if (toast.action) return undefined
    const timer = window.setTimeout(() => onDismiss(toast.id), duration)
    return () => window.clearTimeout(timer)
  }, [duration, onDismiss, toast.action, toast.id])

  return (
    <div
      className={`toast toast-${toast.tone}`}
      role={toast.tone === 'error' ? 'alert' : 'status'}
    >
      <span className="toast-mark" aria-hidden="true">
        {toast.tone === 'success' ? '✓' : '!'}
      </span>
      <span className="toast-content">
        <span className="toast-message">{toast.message}</span>
        {toast.action && (
          <button
            type="button"
            className="toast-action"
            onClick={() => {
              toast.action?.onClick()
              onDismiss(toast.id)
            }}
          >
            {toast.action.label}
          </button>
        )}
      </span>
      <button
        type="button"
        aria-label={`Dismiss notification: ${toast.message}`}
        onClick={() => onDismiss(toast.id)}
      >
        ×
      </button>
    </div>
  )
}

interface ToastRegionProps {
  toasts: ToastMessage[]
  onDismiss(id: number): void
  duration?: number
}

export function ToastRegion({ toasts, onDismiss, duration = 4200 }: ToastRegionProps) {
  return (
    <div
      className="toast-region"
      aria-label="Notifications"
      aria-live="polite"
      aria-relevant="additions text"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} duration={duration} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
