import type { PointerEvent } from 'react'

export function BlockDragHandle({
  index,
  onPointerDown,
  onMove,
}: {
  index: number
  onPointerDown(event: PointerEvent<HTMLButtonElement>): void
  onMove(direction: -1 | 1): void
}) {
  return (
    <button
      type="button"
      className="block-drag-handle"
      aria-label={`Move block ${index + 1}`}
      title="Drag to move block · Alt+Arrow to move"
      onPointerDown={onPointerDown}
      onKeyDown={(event) => {
        if (
          event.altKey &&
          (event.key === 'ArrowUp' || event.key === 'ArrowDown')
        ) {
          event.preventDefault()
          onMove(event.key === 'ArrowUp' ? -1 : 1)
        }
      }}
    >
      <svg viewBox="0 0 12 18" aria-hidden="true">
        {[3, 9].flatMap((x) =>
          [3, 9, 15].map((y) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="1.25" />
          )),
        )}
      </svg>
    </button>
  )
}

export function BlockDropZone({
  boundary,
  dragging,
  pointerId,
  active,
  onTarget,
}: {
  boundary: number
  dragging: boolean
  pointerId: number | null
  active: boolean
  onTarget(boundary: number): void
}) {
  return (
    <div
      className={[
        'block-drop-zone',
        dragging ? 'is-dragging' : '',
        active ? 'is-drop-target' : '',
      ].join(' ')}
      data-drop-boundary={boundary}
      aria-hidden="true"
      onPointerEnter={(event) => {
        if (dragging && event.pointerId === pointerId) onTarget(boundary)
      }}
      onPointerUp={(event) => {
        event.preventDefault()
        if (!dragging || event.pointerId !== pointerId) return
        onTarget(boundary)
      }}
    />
  )
}
