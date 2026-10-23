import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { scrollElement } from './Layout'

/**
 * A responsive, windowed grid inside the main scroll area: columns follow the container width
 * (`minItem` px per tile), and only rows near the viewport are rendered.
 */
export function VirtualGrid<T>({
  items,
  minItem = 168,
  gap = 20,
  extraHeight,
  render,
  getKey,
}: {
  items: T[]
  minItem?: number
  gap?: number
  /** Height below the square artwork (caption), in px. */
  extraHeight: number
  render: (item: T, index: number) => ReactNode
  getKey: (item: T) => string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [offset, setOffset] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setWidth(el.clientWidth)
      setOffset(el.offsetTop)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Phones: two smaller tiles a row rather than one huge one.
  const compact = width > 0 && width < 520
  const gapPx = compact ? 12 : gap
  const min = compact ? Math.min(minItem, 130) : minItem
  const cols = Math.max(1, Math.floor((width + gapPx) / (min + gapPx)))
  const tile = width > 0 ? (width - gapPx * (cols - 1)) / cols : min
  const rowHeight = tile + extraHeight + gapPx
  const rows = Math.ceil(items.length / cols)

  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: scrollElement,
    estimateSize: () => rowHeight,
    overscan: 3,
    scrollMargin: offset,
  })

  useEffect(() => {
    virtualizer.measure()
  }, [rowHeight, virtualizer])

  return (
    <div ref={ref} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {width > 0 &&
        virtualizer.getVirtualItems().map((row) => (
          <div
            key={row.key}
            className="absolute left-0 grid w-full"
            style={{
              top: row.start - offset,
              height: rowHeight - gapPx,
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              columnGap: gapPx,
            }}
          >
            {items.slice(row.index * cols, row.index * cols + cols).map((item, i) => (
              <div key={getKey(item)} className="min-w-0">
                {render(item, row.index * cols + i)}
              </div>
            ))}
          </div>
        ))}
    </div>
  )
}

/** A windowed list of fixed-height rows inside the main scroll area. */
export function VirtualList<T>({
  items,
  rowHeight,
  render,
  getKey,
}: {
  items: T[]
  rowHeight: number
  render: (item: T, index: number) => ReactNode
  getKey: (item: T) => string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [offset, setOffset] = useState(0)
  useLayoutEffect(() => {
    if (ref.current) setOffset(ref.current.offsetTop)
  }, [])
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: scrollElement,
    estimateSize: () => rowHeight,
    overscan: 10,
    scrollMargin: offset,
    getItemKey: (i) => getKey(items[i]),
  })
  return (
    <div ref={ref} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((row) => (
        <div key={row.key} className="absolute left-0 w-full" style={{ top: row.start - offset, height: rowHeight }}>
          {render(items[row.index], row.index)}
        </div>
      ))}
    </div>
  )
}
