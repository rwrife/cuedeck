import { useState, useCallback } from 'react'

/**
 * Minimal HTML5 drag-and-drop reordering for a single vertical list.
 *
 * Why hand-rolled (no dnd lib): CueDeck's lists are short and the interaction
 * is a plain vertical sort, so the native Drag & Drop API covers it without a
 * new dependency, bundle cost, or lockfile churn.
 *
 * Source vs. target split: the drag SOURCE props go on a dedicated grip
 * element, while the drop TARGET props go on the whole row. This means the row
 * is a big, forgiving drop zone, but a drag only begins from the grip — so text
 * selection in inputs and the snippet's separate external drag-out handle are
 * left untouched.
 *
 * Isolation from external drag-out: internal sort drags are tagged with a
 * private MIME type (`mimeType`, unique per list kind). Snippets also expose a
 * separate `text/plain` handle for dragging content OUT into other apps; keying
 * accept logic on this private type keeps the two interactions from colliding —
 * an external file/text drag won't be mistaken for a reorder, and a reorder
 * won't leak `text/plain`.
 */
export interface DragSourceHandlers {
  draggable: true
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
}

export interface DropTargetHandlers {
  onDragEnter: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}

export interface DragSort {
  /** Index currently being dragged, or null. */
  dragIndex: number | null
  /** Index currently hovered as a drop target, or null (render an indicator). */
  overIndex: number | null
  /** Props for the drag grip of row `index`. */
  getSourceProps: (index: number) => DragSourceHandlers
  /** Props for the drop zone (row body) of row `index`. */
  getTargetProps: (index: number) => DropTargetHandlers
}

export function useDragSort(
  mimeType: string,
  onReorder: (from: number, to: number) => void
): DragSort {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const isInternalDrag = useCallback(
    (e: React.DragEvent): boolean => e.dataTransfer.types.includes(mimeType),
    [mimeType]
  )

  const getSourceProps = useCallback(
    (index: number): DragSourceHandlers => ({
      draggable: true,
      onDragStart: (e) => {
        // Tag this as an internal reorder drag with a private type so external
        // drag-out (text/plain) and unrelated drags are never treated as sorts.
        e.dataTransfer.setData(mimeType, String(index))
        e.dataTransfer.effectAllowed = 'move'
        // Stop the grip's dragstart from also triggering an ancestor's drag.
        e.stopPropagation()
        setDragIndex(index)
      },
      onDragEnd: () => {
        setDragIndex(null)
        setOverIndex(null)
      }
    }),
    [mimeType]
  )

  const getTargetProps = useCallback(
    (index: number): DropTargetHandlers => ({
      onDragEnter: (e) => {
        if (!isInternalDrag(e)) return
        e.preventDefault()
        setOverIndex(index)
      },
      onDragOver: (e) => {
        if (!isInternalDrag(e)) return
        // Must preventDefault so this element is a valid drop target.
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (overIndex !== index) setOverIndex(index)
      },
      onDragLeave: (e) => {
        if (!isInternalDrag(e)) return
        // Only clear if we're actually leaving this row (not entering a child).
        if (overIndex === index) setOverIndex(null)
      },
      onDrop: (e) => {
        if (!isInternalDrag(e)) return
        e.preventDefault()
        const from = Number(e.dataTransfer.getData(mimeType))
        if (Number.isInteger(from) && from !== index) onReorder(from, index)
        setDragIndex(null)
        setOverIndex(null)
      }
    }),
    [isInternalDrag, mimeType, onReorder, overIndex]
  )

  return { dragIndex, overIndex, getSourceProps, getTargetProps }
}
