import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import { isRunningInTauri } from '@/lib/tauriRuntime'

// Screens (lazy-loaded later; for now direct imports)
import Login from '@/screens/Login'
import AuthCallback from '@/screens/AuthCallback'
import CompactMode from '@/screens/CompactMode'
import AppShell from '@/components/layout/AppShell'
import Assessment from '@/screens/Assessment'
import Today from '@/screens/Today'
import ReviewQueue from '@/screens/ReviewQueue'
import People from '@/screens/People'
import PersonDetail from '@/screens/PersonDetail'
import PeopleCompanies from '@/screens/PeopleCompanies'
import Lists from '@/screens/Lists'
import ListDetail from '@/screens/ListDetail'
import CompanyDetail from '@/screens/CompanyDetail'
import PeopleOpportunities from '@/screens/PeopleOpportunities'
import OpportunityDetail from '@/screens/OpportunityDetail'
import MilestonePlan from '@/screens/MilestonePlan'
import Playbook from '@/screens/Playbook'
import ContactDetailDrawer from '@/components/ContactDetailDrawer'
import { checkNotificationTriggers, formatNotificationMessage } from '@/lib/notifications'
import { areNotificationsEnabled, getSettings, useUserSettings } from '@/lib/userSettings'
import { useUpdater } from '@/hooks/useUpdater'
import { useGmailAutoSync } from '@/hooks/useGmailAutoSync'
import { persistGoogleProviderSession } from '@/lib/googleDrive'
import { completeOAuthCallback } from '@/lib/authCallback'
import type { Contact } from '@/types'

function cleanCapturePathPart(value: string | null | undefined) {
  return (value || 'unknown')
    .trim()
    .replace(/https?:\/\//gi, '')
    .replace(/[^a-z0-9._ -]+/gi, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 90) || 'unknown'
}

function markdownField(markdown: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return markdown.match(new RegExp(`^- ${escaped}:\\s*(.+)$`, 'im'))?.[1]?.trim() ?? null
}

function markdownTitle(markdown: string, fallback: string) {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || fallback.replace(/\.md$/i, '')
}

function isJobBoardDomain(value: string | null | undefined) {
  const clean = value?.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
  return Boolean(clean && (
    clean.includes('ashbyhq.com') ||
    clean.includes('greenhouse.io') ||
    clean.includes('lever.co') ||
    clean.includes('workable.com') ||
    clean.includes('smartrecruiters.com') ||
    clean.includes('recruitee.com') ||
    clean.includes('applytojob.com')
  ))
}

function normalizeLocalCapturePath(relativePath: string, markdown: string) {
  const parts = relativePath.replace(/^\/+/, '').split('/').filter(Boolean)
  const filename = parts.at(-1) || `${cleanCapturePathPart(markdownTitle(markdown, 'capture'))}.md`
  const type = markdownField(markdown, 'Type')
  const title = markdownTitle(markdown, filename)
  const markdownDomain = markdownField(markdown, 'Domain')
  const legacyRoot = parts[0] === 'Opportunities' ? parts[1] : parts[0]
  const companyFolder = cleanCapturePathPart(
    markdownDomain && !isJobBoardDomain(markdownDomain)
      ? markdownDomain
      : (!isJobBoardDomain(legacyRoot) && legacyRoot && legacyRoot.includes('.') ? legacyRoot : 'unknown-domain'),
  )

  if (parts[0] === 'Opportunities') {
    if (parts[2] === 'People' || parts[2] === 'company.md' || parts[2] === 'linkedin-company.md') return parts.join('/')
    if (parts.length >= 4) return parts.join('/')
  }

  if (type === 'opportunity') {
    return `Opportunities/${companyFolder}/${cleanCapturePathPart(title)}/${filename}`
  }

  if (type === 'person') {
    return `Opportunities/${companyFolder}/People/${filename}`
  }

  if (type === 'company') {
    const companyFile = filename === 'linkedin-company.md' ? filename : 'company.md'
    return `Opportunities/${companyFolder}/${companyFile}`
  }

  return parts.join('/')
}

function Splash() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-6 h-6 border-[1.5px] border-mercury border-t-burnham rounded-full animate-spin" />
      </div>
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasWorkbook, setHasWorkbook] = useState<boolean | null>(null)
  const [settings] = useUserSettings()
  const updater = useUpdater()
  const notificationsEnabled = areNotificationsEnabled(settings)
  useGmailAutoSync(user?.id, Boolean(user && hasWorkbook))

  // App signals: open_contact from external triggers (e.g. Chrome extension)
  const [signalContact, setSignalContact] = useState<Contact | null>(null)
  const [signalDrawerOpen, setSignalDrawerOpen] = useState(false)

  // Check for updates silently on startup (Tauri only)
  useEffect(() => {
    if (!updater.isTauri) return
    const t = setTimeout(() => updater.checkForUpdates(), 5000)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Deep-link OAuth callback (Tauri only) — system browser returns to rethink://oauth-callback.
  useEffect(() => {
    if (!updater.isTauri && !isRunningInTauri()) return
    let unlisten: (() => void) | undefined
    ;(async () => {
      const { onOpenUrl, getCurrent } = await import('@tauri-apps/plugin-deep-link')
      const handle = async (urls: string[]) => {
        for (const raw of urls) {
          try {
            const url = new URL(raw)
            const code = url.searchParams.get('code')
            if (code) {
              await supabase.auth.exchangeCodeForSession(code)
              continue
            }
            const fragment = new URLSearchParams(url.hash.replace(/^#/, ''))
            const accessToken = fragment.get('access_token')
            const refreshToken = fragment.get('refresh_token')
            if (accessToken && refreshToken) {
              await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              })
            }
          } catch {}
        }
      }
      const initial = await getCurrent()
      if (initial && initial.length) await handle(initial)
      unlisten = await onOpenUrl(handle)
    })().catch(() => {})
    return () => { unlisten?.() }
  }, [updater.isTauri])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const callback = await completeOAuthCallback()
      if (callback.error) localStorage.setItem('rethink_auth_error', callback.error)
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      setUser(session?.user ?? null)
      setLoading(false)
    })().catch(() => {
      if (!cancelled) setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (!session?.user) setHasWorkbook(null)
      if (event === 'SIGNED_IN' && session?.provider_token) {
        void persistGoogleProviderSession(session)
      }
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  // hasWorkbook = user has completed onboarding (has at least 1 active goal)
  // Using goals instead of workbooks because workbook row is created at Assessment *mount*
  // (before completion), so workbook existence alone doesn't mean setup is done.
  useEffect(() => {
    if (!user) return
    supabase
      .from('goals')
      .select('id')
      .eq('user_id', user.id)
      .eq('goal_type', 'ACTIVE')
      .limit(1)
      .then(({ data, error }) => setHasWorkbook(!error && (data?.length ?? 0) > 0))
  }, [user])

  // Realtime subscription: app_signals table — signals from the Chrome extension
  useEffect(() => {
    if (!user) return

    // Writes the captured markdown to disk via the Tauri command, then deletes
    // the signal. The extension waits up to 30s for this deletion before it
    // confirms the local write (turns the icon green / unblocks AI analysis).
    async function processWriteCaptureSignal(id: string, payload: Record<string, unknown>) {
      if (!isRunningInTauri()) return // only the desktop app can write locally
      const relativePath = payload?.relative_path as string | undefined
      const markdown = payload?.markdown as string | undefined
      if (!relativePath || markdown == null) return
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('write_capture_markdown', { relativePath: normalizeLocalCapturePath(relativePath, markdown), markdown })
        await supabase.from('app_signals').delete().eq('id', id)
      } catch {
        // Leave the signal in place so a later attempt (or restart) can retry;
        // the extension will time out and keep the icon blue rather than lie.
      }
    }

    // Catch up on any capture-write signals created while the app was closed or
    // not yet subscribed (e.g. user clicked AI in the extension, then opened the app).
    supabase
      .from('app_signals')
      .select('id, action, payload')
      .eq('user_id', user.id)
      .eq('action', 'write_capture_file')
      .then(({ data }) => {
        (data ?? []).forEach(row => processWriteCaptureSignal(row.id, row.payload as Record<string, unknown>))
      })

    const channel = supabase
      .channel('app-signals-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'app_signals',
        filter: `user_id=eq.${user.id}`,
      }, async (payload) => {
        const record = payload.new as { id: string; action: string; payload: Record<string, unknown> }
        if (record.action === 'write_capture_file') {
          await processWriteCaptureSignal(record.id, record.payload)
          return
        }
        if (record.action !== 'open_contact') return
        const contactId = record.payload?.contact_id as string | undefined
        if (!contactId) return

        // Fetch the contact
        const { data: contact } = await supabase
          .from('outreach_logs')
          .select('*')
          .eq('id', contactId)
          .eq('user_id', user.id)
          .single()

        if (contact) {
          setSignalContact(contact as Contact)
          setSignalDrawerOpen(true)
          // Bring Tauri window to front
          if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
            import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
              const w = getCurrentWindow()
              w.show().then(() => w.setFocus())
            }).catch(() => {})
          }
        }

        // Clean up the signal
        await supabase.from('app_signals').delete().eq('id', record.id)
      })
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [user])

  // Smart Notifications (Sprint 11)
  useEffect(() => {
    if (!notificationsEnabled) return
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [notificationsEnabled])

  useEffect(() => {
    if (!notificationsEnabled) return
    const check = async () => {
      if (!areNotificationsEnabled(getSettings())) return
      if (!user || !('Notification' in window) || Notification.permission !== 'granted') return
      const today = new Date().toISOString().split('T')[0]
      const [habitsRes, logsRes, msRes, reviewRes] = await Promise.all([
        supabase.from('habits').select('*').eq('user_id', user.id).eq('is_active', true),
        supabase.from('habit_logs').select('habit_id,value').eq('user_id', user.id).eq('log_date', today),
        supabase.from('milestones').select('*').eq('user_id', user.id).eq('status', 'PENDING'),
        supabase.from('reviews').select('*').eq('user_id', user.id).eq('date', today).maybeSingle(),
      ])

      const triggers = checkNotificationTriggers({
        habits: habitsRes.data ?? [],
        todayLogs: logsRes.data ?? [],
        milestones: msRes.data ?? [],
        review: reviewRes.data,
      })

      for (const trigger of triggers) {
        const { title, body } = formatNotificationMessage(trigger)
        if (body) new Notification(title, { body, icon: '/favicon.ico' })
      }
    }

    const interval = setInterval(check, 60_000) // every minute
    return () => clearInterval(interval)
  }, [user, notificationsEnabled])

  if (loading) return <Splash />

  return (
    <>
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" replace />} />
        <Route path="/auth/callback" element={<AuthCallback signedIn={Boolean(user)} />} />

        {/* Compact mode — standalone window, no AppShell */}
        <Route path="/compact" element={<CompactMode />} />

        {/* Assessment (needs auth, no workbook required) */}
        <Route
          path="/assessment/*"
          element={user ? <Assessment onComplete={() => setHasWorkbook(true)} /> : <Navigate to="/login" replace />}
        />

        {/* Protected app */}
        <Route
          path="/*"
          element={
            !user ? (
              <Navigate to="/login" replace />
            ) : hasWorkbook === null ? (
              <Splash />
            ) : !hasWorkbook ? (
              <Navigate to="/assessment" replace />
            ) : (
              <AppShell user={user} updater={updater}>
                <Routes>
                  <Route path="/" element={<Navigate to="/today" replace />} />
                  <Route path="/today" element={<Today />} />
                  <Route path="/review" element={<ReviewQueue />} />
                  <Route path="/strategy" element={<Navigate to="/milestones" replace />} />
                  <Route path="/monthly" element={<Navigate to="/milestones" replace />} />
                  <Route path="/monthly/:goalId" element={<Navigate to="/milestones" replace />} />
                  <Route path="/dashboard" element={<Navigate to="/milestones" replace />} />
                  <Route path="/dashboard/goal/:id" element={<Navigate to="/milestones" replace />} />
                  <Route path="/weekly-review" element={<Navigate to="/milestones" replace />} />
                  <Route path="/library" element={<Navigate to="/milestones" replace />} />
                  <Route path="/year" element={<Navigate to="/milestones" replace />} />
                  <Route path="/people" element={<People />} />
                  <Route path="/people/companies" element={<PeopleCompanies />} />
                  <Route path="/people/companies/:id" element={<CompanyDetail />} />
                  <Route path="/people/opportunities" element={<PeopleOpportunities />} />
                  <Route path="/people/opportunities/:id" element={<OpportunityDetail />} />
                  <Route path="/people/:id" element={<PersonDetail />} />
                  <Route path="/lists" element={<Lists />} />
                  <Route path="/lists/:id" element={<ListDetail />} />
                  <Route path="/milestones" element={<MilestonePlan />} />
                  <Route path="/plan" element={<Navigate to="/milestones" replace />} />
                  <Route path="/milestone-plan" element={<Navigate to="/milestones" replace />} />
                  <Route path="/playbook" element={<Playbook />} />
                  <Route path="*" element={<Navigate to="/today" replace />} />
                </Routes>
              </AppShell>
            )
          }
        />
      </Routes>
    </BrowserRouter>

    {/* Global: Contact drawer opened via app_signals realtime */}
    {user && (
      <ContactDetailDrawer
        open={signalDrawerOpen}
        contact={signalContact}
        userId={user.id}
        habits={[]}
        upsertHabitCount={async () => {}}
        funnelConfig={null}
        onClose={() => { setSignalDrawerOpen(false); setSignalContact(null) }}
        onUpdate={async (id, updates) => {
          await supabase.from('outreach_logs').update(updates).eq('id', id)
          if (signalContact && signalContact.id === id) {
            setSignalContact(prev => prev ? { ...prev, ...updates } : null)
          }
        }}
        onDelete={async (id) => {
          await supabase.from('outreach_logs').delete().eq('id', id)
          setSignalDrawerOpen(false)
          setSignalContact(null)
        }}
        onSyncToAttio={async () => {}}
      />
    )}
    </>
  )
}
