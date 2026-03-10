import { useState, useEffect } from 'react'
import { MagnifyingGlass, BookOpen, CalendarBlank, Lightning, FileText } from '@phosphor-icons/react'
import { supabase } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'

type LibraryItem = {
  id: string
  type: 'daily_note' | 'weekly_insight' | 'monthly_recap' | 'workbook_entry' | 'annual_letter'
  date: string
  title: string
  content: string
  meta?: string
}

export default function ReflectionLibrary() {
  const [items, setItems] = useState<LibraryItem[]>([])
  const [filtered, setFiltered] = useState<LibraryItem[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<LibraryItem['type'] | 'all'>('all')
  const navigate = useNavigate()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const year = new Date().getFullYear()

      const [reviewsRes, plansRes, workbookRes] = await Promise.all([
        supabase.from('reviews').select('*').eq('user_id', user.id)
          .order('review_date', { ascending: false }).limit(200),
        supabase.from('monthly_plans').select('*').eq('user_id', user.id).eq('year', year)
          .order('month', { ascending: false }),
        supabase.from('workbook_entries').select('*').eq('user_id', user.id),
      ])

      const all: LibraryItem[] = []

      // Daily notes + weekly insights from reviews
      for (const r of reviewsRes.data ?? []) {
        if (r.notes) {
          all.push({
            id: `review-notes-${r.id}`,
            type: 'daily_note',
            date: r.review_date,
            title: `Daily Note — ${new Date(r.review_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
            content: r.notes,
            meta: r.energy_level ? `Energy ${r.energy_level}/10` : undefined,
          })
        }
        if (r.weekly_one_thing) {
          all.push({
            id: `review-weekly-${r.id}`,
            type: 'weekly_insight',
            date: r.review_date,
            title: `Weekly Focus — ${new Date(r.review_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
            content: r.weekly_one_thing,
          })
        }
        if (r.one_thing) {
          all.push({
            id: `review-onething-${r.id}`,
            type: 'daily_note',
            date: r.review_date,
            title: `One Thing — ${new Date(r.review_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
            content: r.one_thing,
          })
        }
      }

      // Monthly recaps
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      for (const p of plansRes.data ?? []) {
        const content = [p.focus, p.reflection, p.highlights].filter(Boolean).join(' · ')
        if (content) {
          all.push({
            id: `plan-${p.id}`,
            type: 'monthly_recap',
            date: `${p.year}-${String(p.month).padStart(2, '0')}-01`,
            title: `${monthNames[p.month - 1]} ${p.year} Monthly Recap`,
            content,
            meta: p.rating ? `★ ${p.rating}/5` : undefined,
          })
        }
      }

      // Workbook entries
      for (const e of workbookRes.data ?? []) {
        if (!e.answer) continue
        const isAnnualLetter = e.section_key === 'annual_letter'
        all.push({
          id: `workbook-${e.id}`,
          type: isAnnualLetter ? 'annual_letter' : 'workbook_entry',
          date: e.created_at?.split('T')[0] ?? '2026-01-01',
          title: isAnnualLetter ? 'Annual Letter — 2026' : 'Workbook Entry',
          content: e.answer,
          meta: e.section_key,
        })
      }

      // Sort by date descending
      all.sort((a, b) => b.date.localeCompare(a.date))
      setItems(all)
      setFiltered(all)
      setLoading(false)
    }
    load()
  }, [])

  // Filter
  useEffect(() => {
    let results = items
    if (typeFilter !== 'all') results = results.filter(i => i.type === typeFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      results = results.filter(i =>
        i.title.toLowerCase().includes(q) || i.content.toLowerCase().includes(q)
      )
    }
    setFiltered(results)
  }, [search, typeFilter, items])

  const typeIcon = (type: LibraryItem['type']) => {
    switch (type) {
      case 'daily_note': return <Lightning size={11} className="text-shuttle" />
      case 'weekly_insight': return <CalendarBlank size={11} className="text-shuttle" />
      case 'monthly_recap': return <BookOpen size={11} className="text-shuttle" />
      case 'annual_letter': return <FileText size={11} className="text-burnham" />
      default: return <FileText size={11} className="text-shuttle" />
    }
  }

  const typeLabel = (type: LibraryItem['type']) => {
    switch (type) {
      case 'daily_note': return 'Daily'
      case 'weekly_insight': return 'Weekly'
      case 'monthly_recap': return 'Monthly'
      case 'annual_letter': return 'Annual Letter'
      case 'workbook_entry': return 'Workbook'
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-mercury px-8 py-5">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-lg font-bold text-burnham">Reflection Library</h1>
              <p className="text-xs text-shuttle mt-0.5">{items.length} entries · 2026</p>
            </div>
            <button onClick={() => navigate(-1)} className="text-xs text-shuttle hover:text-burnham transition-colors">
              ← Back
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <MagnifyingGlass size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-shuttle" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search reflections..."
              className="w-full pl-8 pr-4 py-2 text-sm border border-mercury rounded-lg bg-white text-burnham placeholder-shuttle/50 focus:outline-none focus:border-shuttle transition-colors"
            />
          </div>

          {/* Type filters */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(['all', 'daily_note', 'weekly_insight', 'monthly_recap', 'annual_letter', 'workbook_entry'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide transition-all ${
                  typeFilter === t
                    ? 'bg-burnham text-white'
                    : 'bg-[#F8F9F9] text-shuttle hover:bg-mercury'
                }`}
              >
                {t === 'all' ? 'All' : typeLabel(t)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="max-w-3xl mx-auto px-8 py-6">
        {loading ? (
          <div className="space-y-4">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="h-20 bg-[#F8F9F9] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm text-shuttle">No entries found.</p>
            <p className="text-xs text-shuttle/50 mt-1">Start writing daily notes and monthly recaps to build your library.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(item => (
              <div key={item.id}
                className={`p-4 rounded-xl border transition-all hover:border-shuttle/40 cursor-default ${
                  item.type === 'annual_letter'
                    ? 'bg-gossip/20 border-pastel/50'
                    : 'bg-white border-mercury'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {typeIcon(item.type)}
                  <span className="text-[10px] font-semibold text-shuttle uppercase tracking-widest">
                    {typeLabel(item.type)}
                  </span>
                  {item.meta && (
                    <span className="text-[10px] text-shuttle/60">{item.meta}</span>
                  )}
                  <span className="ml-auto text-[10px] font-mono text-shuttle/40">
                    {new Date(item.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-burnham mb-1">{item.title}</h3>
                <p className="text-xs text-shuttle leading-relaxed line-clamp-2">{item.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
