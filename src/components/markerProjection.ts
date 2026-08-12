export type MarkerProjectionMode = 'plain' | 'list' | 'quote'

interface HiddenMarker {
  start: number
  end: number
  prefix: string
  lineStart: number
  lineEnd: number
}

export interface MarkerProjection {
  canonical: string
  visible: string
  mode: MarkerProjectionMode
  toCanonicalOffset(visibleOffset: number): number
  toVisibleOffset(canonicalOffset: number): number
  applyVisibleEdit(nextVisible: string): string
}

function clamp(offset: number, length: number): number {
  return Math.max(0, Math.min(offset, length))
}

function listMarker(source: string): HiddenMarker[] {
  const lineEnd = source.search(/\r?\n/u)
  const end = lineEnd < 0 ? source.length : lineEnd
  const line = source.slice(0, end)
  const marker = line.match(
    /^(?:\uFEFF)?[ \t]*(?:\d{1,9}[.)]|[-+*])(?:(?:[ \t]+\[[ xX]\](?:[ \t]+|$))|[ \t]+|$)/u,
  )?.[0]
  if (!marker) return []
  return [{ start: 0, end: marker.length, prefix: marker, lineStart: 0, lineEnd: end }]
}

function quoteMarkers(source: string): HiddenMarker[] {
  const markers: HiddenMarker[] = []
  let lineStart = 0
  while (lineStart <= source.length) {
    const breakIndex = source.indexOf('\n', lineStart)
    const lineEnd =
      breakIndex < 0
        ? source.length
        : breakIndex > lineStart && source[breakIndex - 1] === '\r'
          ? breakIndex - 1
          : breakIndex
    const line = source.slice(lineStart, lineEnd)
    const prefix = line.match(/^[ \t]*(?:>[ \t]?)+/u)?.[0]
    if (prefix) {
      markers.push({
        start: lineStart,
        end: lineStart + prefix.length,
        prefix,
        lineStart,
        lineEnd,
      })
    }
    if (breakIndex < 0) break
    lineStart = breakIndex + 1
  }
  return markers
}

function replacementRange(before: string, after: string) {
  let start = 0
  while (start < before.length && start < after.length && before[start] === after[start]) {
    start += 1
  }
  let beforeEnd = before.length
  let afterEnd = after.length
  while (
    beforeEnd > start &&
    afterEnd > start &&
    before[beforeEnd - 1] === after[afterEnd - 1]
  ) {
    beforeEnd -= 1
    afterEnd -= 1
  }
  return { start, beforeEnd, replacement: after.slice(start, afterEnd) }
}

export function createMarkerProjection(
  canonical: string,
  mode: MarkerProjectionMode,
): MarkerProjection {
  const markers =
    mode === 'list'
      ? listMarker(canonical)
      : mode === 'quote'
        ? quoteMarkers(canonical)
        : []
  const visible = markers.reduceRight(
    (value, marker) => value.slice(0, marker.start) + value.slice(marker.end),
    canonical,
  )

  const toVisibleOffset = (rawOffset: number): number => {
    const offset = clamp(rawOffset, canonical.length)
    let removed = 0
    for (const marker of markers) {
      if (offset <= marker.start) break
      if (offset < marker.end) return marker.start - removed
      removed += marker.end - marker.start
    }
    return offset - removed
  }

  const toCanonicalOffset = (rawOffset: number): number => {
    const offset = clamp(rawOffset, visible.length)
    let canonicalOffset = offset
    let removed = 0
    for (const marker of markers) {
      const visibleStart = marker.start - removed
      if (offset < visibleStart) break
      canonicalOffset += marker.end - marker.start
      removed += marker.end - marker.start
    }
    return canonicalOffset
  }

  const applyVisibleEdit = (nextVisible: string): string => {
    if (nextVisible === visible) return canonical
    const change = replacementRange(visible, nextVisible)
    const canonicalStart = toCanonicalOffset(change.start)
    const canonicalEnd = toCanonicalOffset(change.beforeEnd)
    let replacement = change.replacement
    if (mode === 'quote' && replacement.includes('\n')) {
      const currentMarker =
        [...markers]
          .reverse()
          .find(
            (marker) =>
              marker.lineStart <= canonicalStart && canonicalStart <= marker.lineEnd,
          ) ?? markers[0]
      if (currentMarker) {
        replacement = replacement.replace(
          /\r?\n/gu,
          (eol) => `${eol}${currentMarker.prefix}`,
        )
      }
    }
    return (
      canonical.slice(0, canonicalStart) +
      replacement +
      canonical.slice(canonicalEnd)
    )
  }

  return {
    canonical,
    visible,
    mode,
    toCanonicalOffset,
    toVisibleOffset,
    applyVisibleEdit,
  }
}
