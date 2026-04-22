import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, List as ListIcon, Archive, PencilSimple, TrashSimple } from '@phosphor-icons/react'
import { useAuth } from '@/hooks/useAuth'
import { useLists, LIST_TEMPLATES } from '@/hooks/useLists'
import { supabase } from '@/lib/supabase'
import ListEditorModal from '@/components/ListEditorModal'
import type { List as ListType } from '@/types'

export default function Lists() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { lists, loading, createFromTemplate, archiveList, deleteList, reload } = useLists(user?.id)
  const [showEditor, setShowEditor] = useState(false)
  const [editing, setEditing] = useState<ListType | null>(null)
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!user || lists.length === 0) {
      setMemberCounts({})
      return
    }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('list_memberships')
        .select('list_id')
        .eq('user_id', user.id)
      if (cancelled || !data) return
      const counts: Record<string, number> = {}
      for (const r of data as Array<{ list_id: string }>) {
        counts[r.list_id] = (counts[r.list_id] ?? 0) + 1
      }
      setMemberCounts(counts)
    })()
    return () => { cancelled = true }
  }, [user, lists])

  const hasLists = lists.length > 0

  const existingTemplateKeys = useMemo(
    () => new Set(lists.map(l => l.name)),
    [lists],
  )

  function onTemplateClick(templateKey: string) {
    createFromTemplate(templateKey)
  }

  function onCustomClick() {
    setEditing(null)
    setShowEditor(true)
  }

  function onEditClick(list: ListType, e: React.MouseEvent) {
    e.stopPropagation()
    setEditing(list)
    setShowEditor(true)
  }

  function onArchiveClick(list: ListType, e: React.MouseEvent) {
    e.stopPropagation()
    if (confirm(`Archive "${list.name}"? Memberships stay but the list is hidden.`)) {
      archiveList(list.id)
    }
  }

  function onDeleteClick(list: ListType, e: React.MouseEvent) {
    e.stopPropagation()
    if (confirm(`Delete "${list.name}" permanently? All memberships will be lost.`)) {
      deleteList(list.id)
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#FAFAFA]">
      <header className="flex items-center justify-between px-6 py-3.5 border-b border-mercury/60 bg-white">
        <div className="flex items-center gap-2">
          <ListIcon size={18} weight="duotone" className="text-shuttle" />
          <h1 className="text-base font-semibold text-burnham">Lists</h1>
          <span className="text-[11px] text-shuttle/40 font-mono">{lists.length}</span>
        </div>
        <button
          onClick={onCustomClick}
          className="flex items-center gap-1.5 bg-burnham hover:bg-burnham/90 text-gossip text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus size={13} />
          New List
        </button>
      </header>

      <div className="flex-1 overflow-auto px-6 py-6">
        {loading ? (
          <div className="text-center text-shuttle py-12">Loading…</div>
        ) : !hasLists ? (
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
              <ListIcon size={36} className="mx-auto mb-2 text-mercury" />
              <h2 className="text-lg font-semibold text-burnham mb-1">No lists yet</h2>
              <p className="text-sm text-shuttle">
                Lists are your contextual funnels — fundraising, hiring, clients, advisors.
                Start with a template or create your own.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {LIST_TEMPLATES.map(t => (
                <button
                  key={t.key}
                  onClick={() => onTemplateClick(t.key)}
                  className="text-left p-4 bg-white border border-mercury rounded-xl hover:border-burnham transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{t.icon}</span>
                    <span className="font-semibold text-midnight">{t.name}</span>
                  </div>
                  <p className="text-xs text-shuttle mb-3 leading-relaxed">{t.purpose}</p>
                  <div className="flex flex-wrap gap-1">
                    {t.stages.slice(0, 4).map(s => (
                      <span key={s.key} className="text-[10px] px-1.5 py-0.5 bg-mercury/40 text-shuttle rounded">
                        {s.label}
                      </span>
                    ))}
                    {t.stages.length > 4 && (
                      <span className="text-[10px] px-1.5 py-0.5 text-shuttle/60">
                        +{t.stages.length - 4}
                      </span>
                    )}
                  </div>
                </button>
              ))}
              <button
                onClick={onCustomClick}
                className="text-left p-4 bg-white border border-dashed border-mercury rounded-xl hover:border-burnham transition-colors flex flex-col items-center justify-center min-h-[140px]"
              >
                <Plus size={24} className="text-shuttle/50 mb-1" />
                <span className="text-sm font-medium text-shuttle">Custom list</span>
                <span className="text-[11px] text-shuttle/60 mt-1">Build your own stages</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
              {lists.map(list => {
                const count = memberCounts[list.id] ?? 0
                return (
                  <button
                    key={list.id}
                    onClick={() => navigate(`/lists/${list.id}`)}
                    className="text-left p-4 bg-white border border-mercury rounded-xl hover:border-burnham transition-colors group relative"
                    style={{ borderLeftColor: list.color ?? undefined, borderLeftWidth: list.color ? 3 : 1 }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {list.icon && <span className="text-lg">{list.icon}</span>}
                        <span className="font-semibold text-midnight">{list.name}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={e => onEditClick(list, e)} className="p-1 text-shuttle hover:text-burnham" title="Edit">
                          <PencilSimple size={12} />
                        </button>
                        <button onClick={e => onArchiveClick(list, e)} className="p-1 text-shuttle hover:text-burnham" title="Archive">
                          <Archive size={12} />
                        </button>
                        <button onClick={e => onDeleteClick(list, e)} className="p-1 text-shuttle hover:text-red-600" title="Delete">
                          <TrashSimple size={12} />
                        </button>
                      </div>
                    </div>
                    {list.purpose && (
                      <p className="text-xs text-shuttle mb-3 line-clamp-2 leading-relaxed">{list.purpose}</p>
                    )}
                    <div className="flex items-center justify-between text-[11px] text-shuttle/70">
                      <span>{count} {count === 1 ? 'person' : 'people'}</span>
                      <span>{list.stages.length} stages</span>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* templates below existing lists */}
            <div>
              <h3 className="text-xs font-semibold text-shuttle uppercase tracking-wide mb-2">Add from template</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {LIST_TEMPLATES.filter(t => !existingTemplateKeys.has(t.name)).map(t => (
                  <button
                    key={t.key}
                    onClick={() => onTemplateClick(t.key)}
                    className="text-left p-3 bg-white/60 border border-dashed border-mercury rounded-xl hover:bg-white hover:border-burnham transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span>{t.icon}</span>
                      <span className="text-sm font-medium text-midnight">{t.name}</span>
                    </div>
                    <p className="text-[11px] text-shuttle line-clamp-2">{t.purpose}</p>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {showEditor && (
        <ListEditorModal
          open={showEditor}
          existing={editing}
          onClose={() => { setShowEditor(false); setEditing(null) }}
          onSaved={() => { reload(); setShowEditor(false); setEditing(null) }}
        />
      )}
    </div>
  )
}
