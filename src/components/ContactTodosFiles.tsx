/**
 * ContactTodosFiles — surfaces todos that @-mention this contact, plus any files
 * pilled inside them. Closes the one-way gap: todos already carry contact_id (set
 * from @mentions) but the contact profile never queried them, so @-linked files
 * never appeared here.
 */
import { useEffect, useState } from 'react'
import { CheckCircle, Circle, ArrowSquareOut, FileText, GoogleDriveLogo, Link as LinkIcon } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { plainTextFromContentSegments, fileKey, type TodoFileSegment } from '@/lib/todoContent'
import { openTodoFile } from '@/lib/filePills'
import type { Todo } from '@/types'

function FileIcon({ source }: { source: TodoFileSegment['source'] }) {
  if (source === 'google_drive') return <GoogleDriveLogo size={13} className="text-shuttle/70" />
  if (source === 'url') return <LinkIcon size={13} className="text-shuttle/70" />
  return <FileText size={13} className="text-shuttle/70" />
}

export default function ContactTodosFiles({ contactId, userId }: { contactId: string; userId: string }) {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .from('todos')
      .select('*')
      .eq('contact_id', contactId)
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return
        setTodos((data ?? []) as Todo[])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [contactId, userId])

  // Dedup file segments across all todos.
  const files: TodoFileSegment[] = []
  const seenFiles = new Set<string>()
  for (const t of todos) {
    for (const seg of t.content_segments ?? []) {
      if (seg.type === 'file') {
        const key = fileKey(seg)
        if (!seenFiles.has(key)) { seenFiles.add(key); files.push(seg) }
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-24">
        <div className="w-5 h-5 border-[1.5px] border-mercury border-t-burnham rounded-full animate-spin" />
      </div>
    )
  }

  if (todos.length === 0) {
    return <p className="text-[13px] text-shuttle/40 py-8 text-center">No todos mention this person yet. Use @ in a todo to link them.</p>
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Files */}
      {files.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-shuttle/50 mb-2">Linked files ({files.length})</p>
          <div className="flex flex-col gap-1.5">
            {files.map(f => (
              <button
                key={fileKey(f)}
                onClick={() => openTodoFile(f)}
                className="flex items-center gap-2 px-3 py-2 bg-white border border-mercury rounded-lg hover:border-burnham/50 transition-colors text-left group"
              >
                <FileIcon source={f.source} />
                <span className="text-[12px] text-midnight flex-1 truncate">{f.label}</span>
                <ArrowSquareOut size={12} className="text-mercury group-hover:text-burnham transition-colors" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Todos */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-shuttle/50 mb-2">Todos ({todos.length})</p>
        <div className="flex flex-col gap-1.5">
          {todos.map(t => {
            const label = plainTextFromContentSegments(t.content_segments) || t.text
            return (
              <div key={t.id} className="flex items-center gap-2 px-3 py-2 bg-white border border-mercury rounded-lg">
                {t.completed
                  ? <CheckCircle size={15} weight="fill" className="text-pastel shrink-0" />
                  : <Circle size={15} className="text-mercury shrink-0" />}
                <span className={`text-[12px] flex-1 truncate ${t.completed ? 'text-shuttle/50 line-through' : 'text-midnight'}`}>{label}</span>
                {t.date && <span className="text-[10px] text-shuttle/40 shrink-0">{t.date}</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
