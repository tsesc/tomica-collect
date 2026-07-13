import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from 'framer-motion'
import type { CatalogItem } from '../../lib/types'
import type { CaseTheme, TileSize } from '../../hooks/useCollectionLayout'
import { ShowcaseTile, TileFace } from './ShowcaseTile'

export interface ShowcaseEntry {
  collectionId: string
  item: CatalogItem
}

interface Props {
  entries: ShowcaseEntry[] // already in display order
  sizeOf: (catalogId: string) => TileSize
  theme: CaseTheme
  editMode: boolean
  /** Arranging only makes sense on the unfiltered case. */
  canArrange: boolean
  onEnterEdit: () => void
  onCommitOrder: (catalogIds: string[]) => void
  onOpen: (entry: ShowcaseEntry) => void
  onCycleSize: (catalogId: string) => void
  onRemove: (entry: ShowcaseEntry) => void
}

const LONG_PRESS_MS = 450
const MOVE_CANCEL_PX = 10
const EDGE_ZONE_PX = 72

interface GhostState {
  id: string
  width: number
  height: number
  size: TileSize
  dropping: boolean
}

export function ShowcaseGrid({
  entries,
  sizeOf,
  theme,
  editMode,
  canArrange,
  onEnterEdit,
  onCommitOrder,
  onOpen,
  onCycleSize,
  onRemove,
}: Props) {
  const reduceMotion = useReducedMotion()
  const gridRef = useRef<HTMLDivElement>(null)
  const [ids, setIds] = useState<string[]>(() => entries.map((e) => e.item.id))
  const [ghost, setGhost] = useState<GhostState | null>(null)
  const ghostX = useMotionValue(0)
  const ghostY = useMotionValue(0)

  const byId = useRef(new Map<string, ShowcaseEntry>())
  byId.current = new Map(entries.map((e) => [e.item.id, e]))

  const dragRef = useRef<{
    id: string
    grabDX: number
    grabDY: number
    lastTarget: string | null
    ids: string[]
  } | null>(null)

  // Keep local order in sync with props except mid-drag
  useEffect(() => {
    if (!dragRef.current) setIds(entries.map((e) => e.item.id))
  }, [entries])

  const finishDrag = useCallback(() => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    document.body.style.userSelect = ''

    const slot = gridRef.current?.querySelector<HTMLElement>(`[data-tile-id="${CSS.escape(drag.id)}"]`)
    const settle = () => {
      setGhost(null)
      onCommitOrder(drag.ids.map((id) => byId.current.get(id)?.item.id ?? id))
    }
    if (slot && !reduceMotion) {
      const rect = slot.getBoundingClientRect()
      setGhost((g) => (g ? { ...g, dropping: true } : g))
      const spring = { type: 'spring' as const, stiffness: 520, damping: 38 }
      Promise.all([
        animate(ghostX, rect.left, spring),
        animate(ghostY, rect.top, spring),
      ]).then(settle)
    } else {
      settle()
    }
  }, [ghostX, ghostY, onCommitOrder, reduceMotion])

  const handleMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      ghostX.set(e.clientX - drag.grabDX)
      ghostY.set(e.clientY - drag.grabDY)

      // Auto-scroll the page container near its edges
      const scroller = gridRef.current?.closest('main')
      if (scroller) {
        const r = scroller.getBoundingClientRect()
        if (e.clientY < r.top + EDGE_ZONE_PX) scroller.scrollTop -= (r.top + EDGE_ZONE_PX - e.clientY) * 0.2
        else if (e.clientY > r.bottom - EDGE_ZONE_PX) scroller.scrollTop += (e.clientY - r.bottom + EDGE_ZONE_PX) * 0.2
      }

      // Live reflow: move the recessed slot to wherever the pointer hovers
      const under = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>('[data-tile-id]')
      const targetId = under?.dataset.tileId
      if (!targetId || targetId === drag.id || targetId === drag.lastTarget) return
      drag.lastTarget = targetId
      setIds((current) => {
        const next = current.filter((id) => id !== drag.id)
        const at = next.indexOf(targetId)
        if (at === -1) return current
        next.splice(at, 0, drag.id)
        drag.ids = next
        return next
      })
    },
    [ghostX, ghostY],
  )

  const beginDrag = useCallback(
    (id: string, e: PointerEvent | React.PointerEvent) => {
      const tile = gridRef.current?.querySelector<HTMLElement>(`[data-tile-id="${CSS.escape(id)}"]`)
      if (!tile) return
      const rect = tile.getBoundingClientRect()
      dragRef.current = {
        id,
        grabDX: e.clientX - rect.left,
        grabDY: e.clientY - rect.top,
        lastTarget: null,
        ids,
      }
      ghostX.set(rect.left)
      ghostY.set(rect.top)
      setGhost({ id, width: rect.width, height: rect.height, size: sizeOf(byId.current.get(id)?.item.id ?? id), dropping: false })
      document.body.style.userSelect = 'none'
      if ('vibrate' in navigator) navigator.vibrate?.(8)
    },
    [ghostX, ghostY, ids, sizeOf],
  )

  // Window-level listeners while a drag is live
  useEffect(() => {
    if (!ghost || ghost.dropping) return
    const up = () => finishDrag()
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [ghost, handleMove, finishDrag])

  const pressRef = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null)

  const handleTilePointerDown = useCallback(
    (id: string) => (e: React.PointerEvent<HTMLDivElement>) => {
      if (!canArrange || e.button > 0) return
      if (editMode) {
        beginDrag(id, e)
        return
      }
      // View mode: long-press picks the car straight up (and enters edit mode)
      const start = { x: e.clientX, y: e.clientY }
      const timer = setTimeout(() => {
        pressRef.current = null
        onEnterEdit()
        beginDrag(id, { clientX: start.x, clientY: start.y } as PointerEvent)
      }, LONG_PRESS_MS)
      pressRef.current = { timer, x: start.x, y: start.y }
      const cancel = () => {
        if (pressRef.current) clearTimeout(pressRef.current.timer)
        pressRef.current = null
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', cancel)
        window.removeEventListener('pointercancel', cancel)
      }
      const onMove = (ev: PointerEvent) => {
        if (!pressRef.current) return cancel()
        if (Math.hypot(ev.clientX - pressRef.current.x, ev.clientY - pressRef.current.y) > MOVE_CANCEL_PX) cancel()
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', cancel)
      window.addEventListener('pointercancel', cancel)
    },
    [beginDrag, canArrange, editMode, onEnterEdit],
  )

  const ghostEntry = ghost ? byId.current.get(ghost.id) : null

  return (
    <>
      <motion.div
        ref={gridRef}
        initial={reduceMotion ? false : 'hidden'}
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.025, delayChildren: 0.05 } } }}
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 auto-rows-[10.5rem] sm:auto-rows-[11rem] gap-2.5 md:gap-3 [grid-auto-flow:dense]"
      >
        <AnimatePresence mode="popLayout">
          {ids.map((id) => {
            const entry = byId.current.get(id)
            if (!entry) return null
            return (
              <ShowcaseTile
                key={id}
                item={entry.item}
                size={sizeOf(entry.item.id)}
                theme={theme}
                editMode={editMode}
                isDragSource={ghost?.id === id}
                onOpen={() => onOpen(entry)}
                onCycleSize={() => onCycleSize(entry.item.id)}
                onRemove={() => onRemove(entry)}
                onPointerDown={handleTilePointerDown(id)}
              />
            )
          })}
        </AnimatePresence>
      </motion.div>

      {/* Drag ghost: the car picked up out of its compartment */}
      {ghost &&
        ghostEntry &&
        createPortal(
          <motion.div
            className="fixed top-0 left-0 z-[80] pointer-events-none"
            style={{ x: ghostX, y: ghostY, width: ghost.width, height: ghost.height }}
            initial={{ scale: 1, rotate: 0 }}
            animate={
              ghost.dropping
                ? { scale: 1, rotate: 0, transition: { type: 'spring', stiffness: 520, damping: 38 } }
                : { scale: 1.06, rotate: 1.5, transition: { type: 'spring', stiffness: 400, damping: 25 } }
            }
          >
            <div className="w-full h-full rounded-2xl shadow-[0_8px_10px_rgba(39,24,22,0.12),0_24px_48px_-12px_rgba(39,24,22,0.35)]">
              <TileFace item={ghostEntry.item} size={ghost.size} theme={theme} lifted />
            </div>
          </motion.div>,
          document.body,
        )}
    </>
  )
}
