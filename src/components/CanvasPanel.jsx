import { useRef, useState } from 'react'
import { Eye, EyeOff, GripVertical, Layers3, Plus, Trash2, X, Check } from 'lucide-react'

export default function CanvasPanel({
  layers,
  activeLayerId,
  onAddLayer,
  onSelectLayer,
  onToggleLayer,
  onRenameLayer,
  onDeleteLayer,
  onMoveLayer,
  className = '',
  id,
}) {
  const [editingId, setEditingId] = useState(null)
  const [nameDraft, setNameDraft] = useState('')
  const [dragState, setDragState] = useState(null)
  const dragRef = useRef(null)

  const beginRename = (layer) => {
    setEditingId(layer.id)
    setNameDraft(layer.name)
  }

  const saveRename = (event, id) => {
    event.preventDefault()
    onRenameLayer(id, nameDraft)
    setEditingId(null)
  }

  const startLayerDrag = (event, id) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { id, targetId: id, pointerId: event.pointerId }
    setDragState({ id, targetId: id })
  }

  const trackLayerDrag = (event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-layer-id]')
    const targetId = target?.getAttribute('data-layer-id') ?? null
    if (targetId !== drag.targetId) {
      drag.targetId = targetId
      setDragState({ id: drag.id, targetId })
    }
  }

  const finishLayerDrag = (event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (drag.targetId && drag.targetId !== drag.id) onMoveLayer(drag.id, drag.targetId)
    dragRef.current = null
    setDragState(null)
  }

  const cancelLayerDrag = (event) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragState(null)
  }

  return (
    <aside id={id} className={`canvas-settings theme-panel flex max-h-[210px] min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-lg border p-3 lg:max-h-none lg:w-[252px] ${className}`}>
      <section className="flex min-h-0 flex-1 flex-col">
        <div className="mb-2 flex shrink-0 items-center justify-between">
          <h4 className="theme-text flex items-center gap-1.5 text-xs font-semibold"><Layers3 size={14} /> Layers</h4>
          <button type="button" onClick={onAddLayer} disabled={layers.length >= 24} className="theme-muted flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium transition hover:bg-[var(--panel-subtle)] hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Add layer" title={layers.length >= 24 ? 'Maximum 24 layers' : 'Add layer'}><Plus size={13} /> Add</button>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
          {[...layers].reverse().map((layer) => {
            const active = activeLayerId === layer.id
            return (
              <div key={layer.id} data-layer-id={layer.id} className={`layer-row flex items-center gap-1 rounded-md border px-1 py-1 ${active ? 'layer-row-active' : 'border-transparent'} ${dragState?.targetId === layer.id && dragState.id !== layer.id ? 'layer-row-drop-target' : ''} ${dragState?.id === layer.id ? 'layer-row-dragging' : ''}`}>
                <button
                  type="button"
                  className="layer-drag-handle"
                  aria-label={`Drag ${layer.name} to reorder`}
                  title="Drag to reorder"
                  onPointerDown={(event) => startLayerDrag(event, layer.id)}
                  onPointerMove={trackLayerDrag}
                  onPointerUp={finishLayerDrag}
                  onPointerCancel={cancelLayerDrag}
                ><GripVertical size={14} /></button>
                {editingId === layer.id ? (
                  <form className="flex min-w-0 flex-1 items-center gap-1 px-1" onSubmit={(event) => saveRename(event, layer.id)}>
                    <input autoFocus value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} maxLength={48} aria-label="Layer name" className="theme-text min-w-0 w-full bg-transparent text-[11px] outline-none" />
                    <button type="submit" aria-label="Save layer name"><Check size={12} /></button>
                    <button type="button" onClick={() => setEditingId(null)} aria-label="Cancel rename"><X size={12} /></button>
                  </form>
                ) : (
                  <button type="button" onClick={() => onSelectLayer(layer.id)} onDoubleClick={() => beginRename(layer)} className="theme-text min-w-0 flex-1 truncate px-1 text-left text-[11px]" aria-pressed={active} title={`Double-click to rename ${layer.name}`}>
                    {layer.name}
                  </button>
                )}
                <button type="button" onClick={() => onToggleLayer(layer.id)} className="layer-row-action" aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`} title={layer.visible ? 'Hide layer' : 'Show layer'}>{layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>
                <button type="button" onClick={() => onDeleteLayer(layer.id)} disabled={layers.length === 1} className="layer-row-action layer-row-delete" aria-label={`Delete ${layer.name}`} title="Delete layer"><Trash2 size={12} /></button>
              </div>
            )
          })}
          {layers.length === 0 && <p className="theme-muted px-1 py-2 text-[10px]">No layers</p>}
        </div>
      </section>
    </aside>
  )
}
