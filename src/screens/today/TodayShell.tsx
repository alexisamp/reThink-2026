import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { useLists } from '@/hooks/useLists'
import { useAttioObjects } from '@/hooks/useAttioObjects'
import { Icon, type TodayIconName } from './TodayIcons'

const THEME_KEY = 'rethink.today.theme'

export default function TodayShell({ children, user }: { children: ReactNode; user: User }) {
  const navigate = useNavigate()
  const { lists } = useLists(user.id)
  const { objects } = useAttioObjects(user.id, user.email, user.user_metadata?.full_name as string | undefined)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light')
  const [tweaksOpen, setTweaksOpen] = useState(false)
  const fullName = (user.user_metadata?.full_name as string | undefined) || user.email || 'User'
  const initials = fullName.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_KEY, theme)
    return () => document.documentElement.removeAttribute('data-theme')
  }, [theme])

  const records = useMemo(() => {
    const preferred = ['companies', 'people', 'deals']
    const fallback = {
      companies: { id: 'companies', slug: 'companies', plural_name: 'Companies' },
      people: { id: 'people', slug: 'people', plural_name: 'People' },
      deals: { id: 'deals', slug: 'deals', plural_name: 'Deals' },
    }
    return preferred.map(slug => objects.find(object => object.slug === slug) ?? fallback[slug as keyof typeof fallback])
  }, [objects])

  return (
    <div className="today-shell shell">
      <aside className="sidebar">
        <div className="sb-brand">
          <span className="logo">M</span><span className="word">Meridian 71</span>
          <span className="caret"><Icon name="caretDown" size={11} /></span>
        </div>
        <button className="sb-search" onClick={() => window.dispatchEvent(new CustomEvent('rethink:today-command'))}>
          <Icon name="search" size={14} /><span className="label">Quick actions</span><span className="shortcut">⌘K</span>
        </button>
        <div className="sb-scroll">
          <button className="sb-row active" onClick={() => navigate('/today')}><span className="ico"><Icon name="home" size={15} /></span><span className="sb-label">Today</span></button>
          {[
            ['bell', 'Review'], ['sparkle', 'Suggestions'], ['article', 'Playbook'], ['target', 'Plan'],
          ].map(([icon, label]) => (
            <button key={label} className="sb-row soon" disabled><span className="ico"><Icon name={icon as TodayIconName} size={15} /></span><span className="sb-label">{label}</span><span className="soon-tag">Soon</span></button>
          ))}
          <div className="sb-divider" />
          <div className="sb-eyebrow"><span className="em"><Icon name="caretDown" size={9} sw={2} />Records</span><span className="acts"><button title="Object settings" onClick={() => navigate('/settings/data/objects')}><Icon name="sliders" size={12} /></button></span></div>
          {records.map(object => (
            <button key={object.id} className="sb-row indent" onClick={() => navigate(`/${object.slug}/view/all`)}>
              <span className={`sb-pip ${object.slug}`}><Icon name={object.slug === 'people' ? 'users' : object.slug === 'deals' ? 'dollar' : 'article'} size={9} fill /></span>
              <span className="sb-label">{object.plural_name}</span>
            </button>
          ))}
          <div className="sb-divider" />
          <div className="sb-eyebrow"><span className="em"><Icon name="caretDown" size={9} sw={2} />Lists</span></div>
          {lists.slice(0, 8).map(list => (
            <button key={list.id} className="sb-row indent" onClick={() => navigate(`/lists/${list.id}`)}>
              <span className="list-pip" style={{ background: list.color || 'var(--shuttle)' }} />
              <span className="sb-label">{list.name}</span>
            </button>
          ))}
        </div>
        <div className="sb-footer"><div className="sb-user"><span className="av">{initials}</span><span>{fullName}</span></div></div>
      </aside>
      <main className="main">
        <div className="topbar">
          <div className="tb-title"><Icon name="home" size={15} /> Today</div>
          <div className="tb-spacer" />
          <button className="tb-btn" title="Messages"><Icon name="chat" size={14} /></button>
          <button className={`tb-btn${tweaksOpen ? ' on' : ''}`} title="Tweaks" onClick={() => setTweaksOpen(open => !open)}><Icon name="grip" size={14} /></button>
          <button className="tb-ask"><Icon name="sparkle" size={12} /> Ask reThink</button>
        </div>
        {children}
      </main>
      {tweaksOpen && <><button className="today-tweaks-scrim" aria-label="Close tweaks" onClick={() => setTweaksOpen(false)} /><div className="today-tweaks"><div className="today-tweaks-hd">Tweaks</div><div className="today-tweak-row"><span>Theme</span><span className="today-tweak-seg"><button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')}>Light</button><button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')}>Dark</button></span></div></div></>}
    </div>
  )
}
