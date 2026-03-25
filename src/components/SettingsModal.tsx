import { useEffect, useState } from 'react'
import {
  X, ArrowClockwise, CheckCircle, WarningCircle, DownloadSimple, RocketLaunch,
  Eye, EyeSlash, TrashSimple, Plugs, FunnelSimple, ArrowsClockwise,
  PuzzlePiece, UserCircle, Bell, Timer, SignOut, ChartBar,
} from '@phosphor-icons/react'
import type { UpdaterState } from '@/hooks/useUpdater'
import { supabase } from '@/lib/supabase'
import { useFunnelConfig } from '@/hooks/useFunnelConfig'
import { FUNNEL_STAGE_ORDER, UNDELETABLE_STAGES } from '@/lib/funnelDefaults'
import type { ContactStatus, Profile } from '@/types'
import { useUserSettings } from '@/lib/userSettings'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  updater: UpdaterState & {
    isTauri: boolean
    checkForUpdates: () => Promise<void>
    downloadAndInstall: () => Promise<void>
    restartApp: () => Promise<void>
  }
}

type Section = 'profile' | 'notifications' | 'focus' | 'performance' | 'integrations' | 'funnel' | 'updates'

const SECTIONS: { id: Section; label: string; description: string; Icon: React.ElementType }[] = [
  { id: 'profile',       label: 'Profile',              description: 'Your account info and sign out.',                  Icon: UserCircle },
  { id: 'notifications', label: 'Notifications',         description: 'Configure when the app sends reminders.',         Icon: Bell },
  { id: 'focus',         label: 'Focus',                 description: 'Pomodoro defaults and ambient sound.',            Icon: Timer },
  { id: 'performance',   label: 'Performance',           description: 'Habit grading thresholds and adherence targets.',  Icon: ChartBar },
  { id: 'integrations',  label: 'Integrations',          description: 'Connect external tools and services.',            Icon: Plugs },
  { id: 'funnel',        label: 'Relationship Funnel',   description: 'Customize your pipeline stages and criteria.',    Icon: FunnelSimple },
  { id: 'updates',       label: 'Updates',               description: 'Manage app version and auto-update settings.',    Icon: ArrowsClockwise },
]

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const FOCUS_DURATIONS = [
  { minutes: 25, label: '25 min', desc: 'Pomodoro' },
  { minutes: 52, label: '52 min', desc: 'Ultradian' },
  { minutes: 90, label: '90 min', desc: 'Deep Work' },
]
const SHORT_BREAKS = [5, 10, 15]
const LONG_BREAKS  = [15, 20, 30]

export default function SettingsModal({ open, onClose, updater }: SettingsModalProps) {
  const [section, setSection] = useState<Section>('profile')
  const [appVersion, setAppVersion] = useState<string>('')

  // Auth / profile
  const [userId, setUserId] = useState<string | undefined>(undefined)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined)
  const [fullName, setFullName] = useState<string>('')
  const [email, setEmail] = useState<string>('')

  // Integrations
  const [attioKey, setAttioKey] = useState('')
  const [attioKeyVisible, setAttioKeyVisible] = useState(false)
  const [attioSaved, setAttioSaved] = useState(false)
  const [chromeExtCopied, setChromeExtCopied] = useState(false)
  const [chromeExtCode, setChromeExtCode] = useState('')

  // Funnel
  const [deletingStage, setDeletingStage] = useState<ContactStatus | null>(null)
  const [migrateTo, setMigrateTo] = useState<ContactStatus>('PROSPECT')
  const [deleteConfirmed, setDeleteConfirmed] = useState(false)

  // User settings
  const [settings, updateSettings] = useUserSettings()

  const { config, getStageConfig, updateStage, deleteStage, getActiveStages } = useFunnelConfig(userId, profile)

  useEffect(() => {
    if (!open) return
    setAttioKey(localStorage.getItem('attio_api_key') ?? '')
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      setUserId(data.user.id)
      setEmail(data.user.email ?? '')
      const meta = data.user.user_metadata
      setAvatarUrl(meta?.avatar_url as string | undefined)
      setFullName((meta?.full_name as string | undefined) ?? '')
      supabase.from('profiles').select('*').eq('id', data.user.id).maybeSingle().then(({ data: p }) => {
        if (p) setProfile(p as Profile)
      })
    })
  }, [open])

  useEffect(() => {
    if (!updater.isTauri) return
    import('@tauri-apps/api/app').then(({ getVersion }) =>
      getVersion().then(setAppVersion).catch(() => {})
    )
  }, [updater.isTauri])

  const generateExtensionCode = async () => {
    try {
      const { data } = await supabase.auth.getSession()
      const session = data.session
      if (!session) return
      const payload = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        user_id: session.user.id,
        expires_at: session.expires_at,
      }
      setChromeExtCode(btoa(JSON.stringify(payload)))
    } catch (_err) {}
  }

  const copyExtensionCode = () => {
    if (!chromeExtCode) return
    try {
      const ta = document.createElement('textarea')
      ta.value = chromeExtCode
      ta.style.cssText = 'position:fixed;opacity:0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setChromeExtCopied(true)
      setTimeout(() => setChromeExtCopied(false), 2000)
      return
    } catch (_) {}
    navigator.clipboard.writeText(chromeExtCode).then(() => {
      setChromeExtCopied(true)
      setTimeout(() => setChromeExtCopied(false), 2000)
    }).catch(() => {})
  }

  const saveAttioKey = async () => {
    const trimmed = attioKey.trim()
    if (trimmed) localStorage.setItem('attio_api_key', trimmed)
    else localStorage.removeItem('attio_api_key')
    // Sync to Supabase user metadata so the Chrome extension can read it
    await supabase.auth.updateUser({ data: { attio_api_key: trimmed || null } })
    setAttioSaved(true)
    setTimeout(() => setAttioSaved(false), 2000)
  }

  const statusLabel: Record<typeof updater.status, string> = {
    idle: '',
    checking: 'Checking for updates…',
    'up-to-date': 'You\'re on the latest version.',
    available: `New version available: ${updater.update?.version}`,
    downloading: `Downloading… ${updater.progress}%`,
    ready: 'Download complete. Ready to restart.',
    error: updater.error ?? 'Error checking for updates.',
  }

  const showUpdateDot = updater.status === 'available' || updater.status === 'ready'
  const initials = (fullName || email || 'U')[0].toUpperCase()

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/30 backdrop-blur-[4px]"
      onClick={onClose}
    >
      <div
        className="w-[960px] h-[660px] bg-white rounded-2xl shadow-2xl overflow-hidden flex border border-mercury/60 relative"
        style={{ boxShadow: '0 32px 80px rgba(0,55,32,0.16), 0 4px 20px rgba(0,0,0,0.10)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Close button ── */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-7 h-7 flex items-center justify-center rounded-full text-shuttle/40 hover:text-shuttle hover:bg-mercury/50 transition-all"
        >
          <X size={14} />
        </button>

        {/* ── Left Sidebar ── */}
        <div className="w-[220px] bg-[#F5F7F5] border-r border-mercury/50 flex flex-col shrink-0">

          {/* User identity */}
          <div className="px-5 pt-6 pb-5">
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-10 h-10 rounded-full shrink-0 ring-2 ring-white shadow-sm" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-burnham flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {initials}
                </div>
              )}
              <div className="overflow-hidden min-w-0">
                <p className="text-sm font-semibold text-burnham truncate leading-tight">{fullName || 'User'}</p>
                <p className="text-xs text-shuttle/50 truncate leading-tight mt-0.5">{email}</p>
              </div>
            </div>
          </div>

          <div className="mx-4 border-t border-mercury/60" />

          {/* Nav items */}
          <nav className="flex-1 px-3 py-3 space-y-0.5">
            {SECTIONS.map(({ id, label, Icon }) => {
              const isActive = section === id
              const isUpdates = id === 'updates'
              return (
                <button
                  key={id}
                  onClick={() => setSection(id)}
                  className={[
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 text-left',
                    isActive
                      ? 'bg-gossip/60 text-burnham font-medium shadow-sm'
                      : 'text-shuttle hover:bg-mercury/50 hover:text-burnham',
                  ].join(' ')}
                >
                  <Icon size={16} weight={isActive ? 'bold' : 'regular'} className="shrink-0" />
                  <span className="flex-1">{label}</span>
                  {isUpdates && showUpdateDot && (
                    <span className="w-2 h-2 rounded-full bg-pastel shrink-0" />
                  )}
                </button>
              )
            })}
          </nav>
        </div>

        {/* ── Right Content ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Section header */}
          <div className="px-9 pt-8 pb-5 border-b border-mercury/40">
            <h1 className="text-lg font-semibold text-burnham tracking-tight">
              {SECTIONS.find(s => s.id === section)?.label}
            </h1>
            <p className="text-xs text-shuttle/60 mt-0.5">
              {SECTIONS.find(s => s.id === section)?.description}
            </p>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-9 py-7">

            {/* ── PROFILE ── */}
            {section === 'profile' && (
              <div className="space-y-5">
                <div className="flex items-center gap-5 p-5 border border-mercury/70 rounded-2xl bg-[#FAFAF9]">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-16 h-16 rounded-full ring-2 ring-white shadow-md shrink-0" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-burnham flex items-center justify-center text-white text-2xl font-bold shrink-0">
                      {initials}
                    </div>
                  )}
                  <div>
                    <p className="text-base font-semibold text-burnham">{fullName || 'User'}</p>
                    <p className="text-sm text-shuttle/60 mt-0.5">{email}</p>
                    <p className="text-xs text-shuttle/40 mt-1.5">Signed in with Google</p>
                  </div>
                </div>

                <SettingRow
                  label="App version"
                  description="Your current installed version of reThink."
                >
                  <span className="text-xs font-mono text-burnham bg-mercury/30 px-3 py-1.5 rounded-lg">
                    {appVersion ? `v${appVersion}` : '—'}
                  </span>
                </SettingRow>

                <div className="pt-1">
                  <button
                    onClick={() => { supabase.auth.signOut(); onClose() }}
                    className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600 border border-red-200 hover:border-red-300 px-4 py-2 rounded-xl transition-all hover:bg-red-50"
                  >
                    <SignOut size={15} />
                    Sign out
                  </button>
                </div>
              </div>
            )}

            {/* ── NOTIFICATIONS ── */}
            {section === 'notifications' && (
              <div className="space-y-px">
                <NotifRow
                  label="Morning Brief"
                  description="Daily summary of your habits and One Thing."
                  enabled={settings.notifMorningEnabled}
                  time={settings.notifMorningTime}
                  onToggle={v => updateSettings({ notifMorningEnabled: v })}
                  onTimeChange={v => updateSettings({ notifMorningTime: v })}
                />

                <NotifRow
                  label="Streak at Risk"
                  description="Evening reminder for habits not yet logged."
                  enabled={settings.notifEveningEnabled}
                  time={settings.notifEveningTime}
                  onToggle={v => updateSettings({ notifEveningEnabled: v })}
                  onTimeChange={v => updateSettings({ notifEveningTime: v })}
                />

                {/* Weekly Review */}
                <div className="flex items-start justify-between gap-4 py-4 border-b border-mercury/40 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-burnham leading-tight">Weekly Review</p>
                    <p className="text-xs text-shuttle/50 mt-0.5">Reminder to complete your weekly review.</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {settings.notifWeeklyEnabled && (
                      <>
                        <select
                          value={settings.notifWeeklyDay}
                          onChange={e => updateSettings({ notifWeeklyDay: Number(e.target.value) })}
                          className="text-xs text-burnham border border-mercury rounded-xl px-2.5 py-2 bg-white focus:outline-none focus:border-shuttle/50 transition-colors"
                        >
                          {DAYS.map((d, i) => (
                            <option key={d} value={i}>{d}</option>
                          ))}
                        </select>
                        <input
                          type="time"
                          value={settings.notifWeeklyTime}
                          onChange={e => updateSettings({ notifWeeklyTime: e.target.value })}
                          className="text-xs text-burnham border border-mercury rounded-xl px-2.5 py-2 bg-white focus:outline-none focus:border-shuttle/50 transition-colors w-24"
                        />
                      </>
                    )}
                    <Toggle
                      enabled={settings.notifWeeklyEnabled}
                      onChange={v => updateSettings({ notifWeeklyEnabled: v })}
                    />
                  </div>
                </div>

                {/* Morning Ritual window */}
                <div className="flex items-start justify-between gap-4 py-4 border-b border-mercury/40 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-burnham leading-tight">Morning Ritual window</p>
                    <p className="text-xs text-shuttle/50 mt-0.5">Time window when the Morning Ritual wizard appears.</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-shuttle/50">from</span>
                    <input
                      type="time"
                      value={settings.morningRitualStart}
                      onChange={e => updateSettings({ morningRitualStart: e.target.value })}
                      className="text-xs text-burnham border border-mercury rounded-xl px-2.5 py-2 bg-white focus:outline-none focus:border-shuttle/50 transition-colors w-24"
                    />
                    <span className="text-xs text-shuttle/50">to</span>
                    <input
                      type="time"
                      value={settings.morningRitualEnd}
                      onChange={e => updateSettings({ morningRitualEnd: e.target.value })}
                      className="text-xs text-burnham border border-mercury rounded-xl px-2.5 py-2 bg-white focus:outline-none focus:border-shuttle/50 transition-colors w-24"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── FOCUS ── */}
            {section === 'focus' && (
              <div className="space-y-7">

                <div>
                  <p className="text-sm font-medium text-burnham mb-1">Default session duration</p>
                  <p className="text-xs text-shuttle/50 mb-3">Sets the timer when you open a new focus session.</p>
                  <div className="flex gap-2">
                    {FOCUS_DURATIONS.map(({ minutes, label, desc }) => (
                      <button
                        key={minutes}
                        onClick={() => updateSettings({ focusDefaultMinutes: minutes })}
                        className={[
                          'flex-1 py-3 px-3 rounded-xl border text-sm transition-all',
                          settings.focusDefaultMinutes === minutes
                            ? 'border-burnham bg-burnham/5 text-burnham font-semibold'
                            : 'border-mercury text-shuttle hover:border-shuttle/40 hover:text-burnham',
                        ].join(' ')}
                      >
                        <div className="font-semibold">{label}</div>
                        <div className="text-xs opacity-60 mt-0.5">{desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-burnham mb-1">Short break</p>
                  <p className="text-xs text-shuttle/50 mb-3">Duration after each focus session.</p>
                  <div className="flex gap-2">
                    {SHORT_BREAKS.map(m => (
                      <button
                        key={m}
                        onClick={() => updateSettings({ focusShortBreak: m })}
                        className={[
                          'flex-1 py-2.5 px-3 rounded-xl border text-sm transition-all',
                          settings.focusShortBreak === m
                            ? 'border-burnham bg-burnham/5 text-burnham font-semibold'
                            : 'border-mercury text-shuttle hover:border-shuttle/40 hover:text-burnham',
                        ].join(' ')}
                      >
                        {m} min
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-burnham mb-1">Long break</p>
                  <p className="text-xs text-shuttle/50 mb-3">Duration after every 4 sessions.</p>
                  <div className="flex gap-2">
                    {LONG_BREAKS.map(m => (
                      <button
                        key={m}
                        onClick={() => updateSettings({ focusLongBreak: m })}
                        className={[
                          'flex-1 py-2.5 px-3 rounded-xl border text-sm transition-all',
                          settings.focusLongBreak === m
                            ? 'border-burnham bg-burnham/5 text-burnham font-semibold'
                            : 'border-mercury text-shuttle hover:border-shuttle/40 hover:text-burnham',
                        ].join(' ')}
                      >
                        {m} min
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-burnham mb-1">Default ambient sound</p>
                  <p className="text-xs text-shuttle/50 mb-3">Plays automatically when a focus session starts.</p>
                  <div className="flex gap-2">
                    {(['none', 'brown', 'rain'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => updateSettings({ focusAmbientSound: s })}
                        className={[
                          'flex-1 py-2.5 px-3 rounded-xl border text-sm transition-all',
                          settings.focusAmbientSound === s
                            ? 'border-burnham bg-burnham/5 text-burnham font-medium'
                            : 'border-mercury text-shuttle hover:border-shuttle/40 hover:text-burnham',
                        ].join(' ')}
                      >
                        {s === 'none' ? 'None' : s === 'brown' ? 'Brown Noise' : 'Rain'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-burnham">Ambient volume</p>
                    <span className="text-xs text-shuttle/50 font-mono">
                      {Math.round(settings.focusAmbientVolume * 100)}%
                    </span>
                  </div>
                  <p className="text-xs text-shuttle/50 mb-3">Volume level for ambient sounds during focus.</p>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings.focusAmbientVolume}
                    onChange={e => updateSettings({ focusAmbientVolume: parseFloat(e.target.value) })}
                    className="w-full accent-burnham"
                    disabled={settings.focusAmbientSound === 'none'}
                  />
                </div>

              </div>
            )}

            {/* ── PERFORMANCE ── */}
            {section === 'performance' && (
              <div className="space-y-6">

                <SettingRow
                  label="Adherence target"
                  description="Adherence badge shows on a habit when it falls below this threshold."
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={50}
                      max={100}
                      step={5}
                      value={settings.adherenceTarget}
                      onChange={e => updateSettings({ adherenceTarget: Number(e.target.value) })}
                      className="w-16 text-sm text-burnham text-center border border-mercury rounded-xl px-2 py-1.5 bg-white focus:outline-none focus:border-shuttle/50 transition-colors"
                    />
                    <span className="text-sm text-shuttle/60">%</span>
                  </div>
                </SettingRow>

                <div>
                  <p className="text-sm font-medium text-burnham mb-1">Habit grade thresholds</p>
                  <p className="text-xs text-shuttle/50 mb-5">Minimum adherence % required to earn each grade in Monthly view.</p>

                  <div className="space-y-3">
                    {[
                      { key: 'gradeA' as const, label: 'A', color: 'text-burnham bg-gossip border-gossip/70' },
                      { key: 'gradeB' as const, label: 'B', color: 'text-burnham bg-pastel/30 border-pastel/40' },
                      { key: 'gradeC' as const, label: 'C', color: 'text-shuttle bg-mercury/40 border-mercury' },
                    ].map(({ key, label, color }) => (
                      <div key={key} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`w-7 h-7 rounded-lg border text-xs font-bold flex items-center justify-center ${color}`}>
                            {label}
                          </span>
                          <span className="text-sm text-burnham">Grade {label} ≥</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={5}
                            value={settings[key]}
                            onChange={e => updateSettings({ [key]: Number(e.target.value) })}
                            className="w-16 text-sm text-burnham text-center border border-mercury rounded-xl px-2 py-1.5 bg-white focus:outline-none focus:border-shuttle/50 transition-colors"
                          />
                          <span className="text-sm text-shuttle/60">%</span>
                        </div>
                      </div>
                    ))}

                    <div className="flex items-center justify-between opacity-50">
                      <div className="flex items-center gap-3">
                        <span className="w-7 h-7 rounded-lg border text-xs font-bold flex items-center justify-center text-shuttle bg-mercury/20 border-mercury">
                          D
                        </span>
                        <span className="text-sm text-burnham">Grade D &lt;</span>
                      </div>
                      <span className="text-sm font-mono text-shuttle/70 mr-[72px]">{settings.gradeC}%</span>
                    </div>
                  </div>

                  <div className="mt-5 px-4 py-3 rounded-xl bg-[#F5F7F5] border border-mercury/60">
                    <p className="text-xs text-shuttle/50 mb-1.5">Grade scale preview</p>
                    <p className="text-sm text-burnham font-mono">
                      A ≥ {settings.gradeA}% · B ≥ {settings.gradeB}% · C ≥ {settings.gradeC}% · D &lt; {settings.gradeC}%
                    </p>
                  </div>
                </div>

              </div>
            )}

            {/* ── INTEGRATIONS ── */}
            {section === 'integrations' && (
              <div className="space-y-5">

                <SettingCard
                  icon={<PuzzlePiece size={16} className="text-shuttle/60" />}
                  label="Chrome Extension"
                  description="Generate a one-time code and paste it in the extension popup to connect your account."
                >
                  {!chromeExtCode ? (
                    <button
                      onClick={generateExtensionCode}
                      className="px-4 py-2 text-sm font-medium bg-burnham text-white rounded-xl hover:bg-burnham/90 transition-colors"
                    >
                      Generate connect code
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        readOnly
                        value={chromeExtCode}
                        onFocus={e => e.target.select()}
                        className="flex-1 px-3 py-2 text-xs font-mono bg-mercury/30 border border-mercury rounded-xl text-shuttle truncate cursor-text min-w-0"
                      />
                      <button
                        onClick={copyExtensionCode}
                        className="shrink-0 px-4 py-2 text-sm font-medium bg-burnham text-white rounded-xl hover:bg-burnham/90 transition-colors"
                      >
                        {chromeExtCopied ? 'Copied ✓' : 'Copy'}
                      </button>
                    </div>
                  )}
                </SettingCard>

                <SettingCard
                  icon={<Plugs size={16} className="text-shuttle/60" />}
                  label="Attio API key"
                  description="Connect your Attio workspace to sync contacts and activities."
                >
                  <div className="flex items-center gap-2 mt-1">
                    <div className="relative flex-1 min-w-0">
                      <input
                        type={attioKeyVisible ? 'text' : 'password'}
                        value={attioKey}
                        onChange={e => setAttioKey(e.target.value)}
                        onBlur={saveAttioKey}
                        onKeyDown={e => { if (e.key === 'Enter') saveAttioKey() }}
                        placeholder="Bearer token…"
                        className="w-full text-sm text-burnham border border-mercury rounded-xl px-3 py-2 pr-9 focus:outline-none focus:border-shuttle/50 transition-colors bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setAttioKeyVisible(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-shuttle/40 hover:text-shuttle transition-colors"
                      >
                        {attioKeyVisible ? <EyeSlash size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <button
                      onClick={saveAttioKey}
                      className="shrink-0 px-4 py-2 text-sm font-medium bg-burnham text-white rounded-xl hover:bg-burnham/90 transition-colors"
                    >
                      Save
                    </button>
                  </div>
                  <p className="text-xs mt-2 font-mono">
                    {attioSaved
                      ? <span className="text-pastel">Saved ✓</span>
                      : attioKey.trim()
                        ? <span className="text-shuttle/40">Configured</span>
                        : <span className="text-shuttle/30">Not configured</span>
                    }
                  </p>
                </SettingCard>
              </div>
            )}

            {/* ── FUNNEL ── */}
            {section === 'funnel' && (
              <div className="space-y-4">
                {FUNNEL_STAGE_ORDER.filter(s => getActiveStages().includes(s)).map(status => {
                  const cfg = getStageConfig(status)
                  const isDeletable = !UNDELETABLE_STAGES.includes(status)
                  return (
                    <div key={status} className="border border-mercury rounded-2xl p-5 space-y-3 bg-white">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-shuttle/60">{status}</span>
                        {isDeletable && (
                          <button
                            onClick={() => { setDeletingStage(status); setMigrateTo('PROSPECT'); setDeleteConfirmed(false) }}
                            className="text-shuttle/30 hover:text-red-400 transition-colors p-1 rounded hover:bg-red-50"
                            title={`Delete ${status} stage`}
                          >
                            <TrashSimple size={13} />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] text-shuttle/50 uppercase tracking-wide block mb-1">Label</label>
                          <input
                            type="text"
                            defaultValue={cfg.label}
                            onBlur={e => updateStage(status, { label: e.target.value })}
                            className="w-full text-sm text-burnham border border-mercury rounded-xl px-3 py-2 focus:outline-none focus:border-shuttle/50 transition-colors bg-[#FAFAF9]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-shuttle/50 uppercase tracking-wide block mb-1">Description</label>
                          <input
                            type="text"
                            defaultValue={cfg.description}
                            onBlur={e => updateStage(status, { description: e.target.value })}
                            className="w-full text-sm text-burnham border border-mercury rounded-xl px-3 py-2 focus:outline-none focus:border-shuttle/50 transition-colors bg-[#FAFAF9]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-shuttle/50 uppercase tracking-wide block mb-1">Entry criteria</label>
                          <textarea
                            rows={2}
                            defaultValue={cfg.entry_criteria}
                            onBlur={e => updateStage(status, { entry_criteria: e.target.value })}
                            className="w-full text-sm text-burnham border border-mercury rounded-xl px-3 py-2 focus:outline-none focus:border-shuttle/50 transition-colors resize-none bg-[#FAFAF9]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-shuttle/50 uppercase tracking-wide block mb-1">Exit criteria</label>
                          <textarea
                            rows={2}
                            defaultValue={cfg.exit_criteria}
                            onBlur={e => updateStage(status, { exit_criteria: e.target.value })}
                            className="w-full text-sm text-burnham border border-mercury rounded-xl px-3 py-2 focus:outline-none focus:border-shuttle/50 transition-colors resize-none bg-[#FAFAF9]"
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}

                {deletingStage && (
                  <div className="border border-red-200 bg-red-50/60 rounded-2xl p-5 space-y-3">
                    <p className="text-sm font-semibold text-red-700">
                      Delete stage "{config[deletingStage]?.label ?? deletingStage}"?
                    </p>
                    <p className="text-xs text-red-600/80">
                      All contacts in this stage will be moved to the selected stage before deletion.
                    </p>
                    <div>
                      <label className="text-[10px] text-red-600/70 uppercase tracking-wide block mb-1">Move contacts to</label>
                      <select
                        value={migrateTo}
                        onChange={e => setMigrateTo(e.target.value as ContactStatus)}
                        className="text-sm text-burnham border border-red-200 rounded-xl px-3 py-2 bg-white focus:outline-none"
                      >
                        {FUNNEL_STAGE_ORDER.filter(s => s !== deletingStage && getActiveStages().includes(s)).map(s => (
                          <option key={s} value={s}>{config[s]?.label ?? s}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setDeletingStage(null)}
                        className="flex-1 text-sm text-shuttle/60 border border-mercury rounded-xl px-3 py-2 hover:bg-mercury/20 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={async () => {
                          if (!deleteConfirmed) { setDeleteConfirmed(true); return }
                          await deleteStage(deletingStage, migrateTo)
                          setDeletingStage(null)
                          setDeleteConfirmed(false)
                        }}
                        className="flex-1 text-sm bg-red-500 text-white rounded-xl px-3 py-2 hover:bg-red-600 transition-colors font-medium"
                      >
                        {deleteConfirmed ? 'Confirm delete' : 'Delete stage'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── UPDATES ── */}
            {section === 'updates' && (
              <div className="space-y-5">

                <SettingRow
                  label="Installed version"
                  description={updater.lastChecked
                    ? `Last checked: ${updater.lastChecked.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}`
                    : 'Not checked yet this session.'
                  }
                >
                  <span className="text-sm font-mono text-burnham bg-mercury/30 px-3 py-1.5 rounded-lg">
                    {appVersion ? `v${appVersion}` : '—'}
                  </span>
                </SettingRow>

                {updater.status !== 'idle' && (
                  <div className={[
                    'flex items-start gap-3 text-sm px-5 py-3.5 rounded-xl border',
                    updater.status === 'error'
                      ? 'bg-red-50 text-red-600 border-red-200'
                      : updater.status === 'available' || updater.status === 'ready'
                        ? 'bg-gossip/30 text-burnham border-gossip/60'
                        : 'bg-mercury/15 text-shuttle border-mercury/40',
                  ].join(' ')}>
                    {updater.status === 'error'      && <WarningCircle size={15} className="shrink-0 mt-0.5" />}
                    {updater.status === 'up-to-date' && <CheckCircle size={15} className="shrink-0 mt-0.5 text-pastel" />}
                    {updater.status === 'ready'      && <CheckCircle size={15} className="shrink-0 mt-0.5 text-pastel" />}
                    {updater.status === 'available'  && <DownloadSimple size={15} className="shrink-0 mt-0.5 text-burnham" />}
                    <span>{statusLabel[updater.status]}</span>
                  </div>
                )}

                {updater.status === 'downloading' && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-shuttle/50">
                      <span>Downloading update…</span>
                      <span>{updater.progress}%</span>
                    </div>
                    <div className="w-full bg-mercury/40 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full bg-pastel rounded-full transition-all duration-300"
                        style={{ width: `${updater.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div>
                  {(updater.status === 'idle' || updater.status === 'up-to-date' || updater.status === 'error') && (
                    <button
                      onClick={updater.checkForUpdates}
                      disabled={!updater.isTauri}
                      className="flex items-center gap-2 text-sm font-medium bg-burnham text-white px-5 py-2.5 rounded-xl hover:bg-burnham/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ArrowClockwise size={14} />
                      Check for updates
                    </button>
                  )}

                  {updater.status === 'checking' && (
                    <div className="flex items-center gap-2 text-sm text-shuttle py-2">
                      <div className="w-4 h-4 border border-shuttle border-t-transparent rounded-full animate-spin" />
                      Checking for updates…
                    </div>
                  )}

                  {updater.status === 'available' && (
                    <button
                      onClick={updater.downloadAndInstall}
                      className="flex items-center gap-2 text-sm font-medium bg-burnham text-white px-5 py-2.5 rounded-xl hover:bg-burnham/90 transition-colors"
                    >
                      <DownloadSimple size={14} />
                      Install v{updater.update?.version}
                    </button>
                  )}

                  {updater.status === 'ready' && (
                    <button
                      onClick={updater.restartApp}
                      className="flex items-center gap-2 text-sm font-medium bg-gossip text-burnham px-5 py-2.5 rounded-xl hover:bg-gossip/80 transition-colors font-semibold"
                    >
                      <RocketLaunch size={14} />
                      Restart and update
                    </button>
                  )}

                  {updater.status === 'downloading' && (
                    <div className="flex items-center gap-2 text-sm text-shuttle py-2">
                      <div className="w-4 h-4 border border-shuttle border-t-transparent rounded-full animate-spin" />
                      Downloading {updater.progress}%
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Sub-components ── */

function SettingRow({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-mercury/40 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-burnham leading-tight">{label}</p>
        {description && (
          <p className="text-xs text-shuttle/50 mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function SettingCard({
  icon,
  label,
  description,
  children,
}: {
  icon: React.ReactNode
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="border border-mercury/70 rounded-2xl p-5 space-y-3 bg-white shadow-sm">
      <div className="flex items-center gap-2.5">
        <span className="shrink-0">{icon}</span>
        <p className="text-sm font-semibold text-burnham">{label}</p>
      </div>
      {description && (
        <p className="text-xs text-shuttle/55 leading-relaxed">{description}</p>
      )}
      {children}
    </div>
  )
}

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={[
        'relative w-10 h-[22px] rounded-full transition-colors duration-200 shrink-0',
        enabled ? 'bg-burnham' : 'bg-mercury',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200',
          enabled ? 'translate-x-[22px]' : 'translate-x-[3px]',
        ].join(' ')}
      />
    </button>
  )
}

function NotifRow({
  label,
  description,
  enabled,
  time,
  onToggle,
  onTimeChange,
}: {
  label: string
  description: string
  enabled: boolean
  time: string
  onToggle: (v: boolean) => void
  onTimeChange: (v: string) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-mercury/40 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-burnham leading-tight">{label}</p>
        <p className="text-xs text-shuttle/50 mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        {enabled && (
          <input
            type="time"
            value={time}
            onChange={e => onTimeChange(e.target.value)}
            className="text-xs text-burnham border border-mercury rounded-xl px-2.5 py-2 bg-white focus:outline-none focus:border-shuttle/50 transition-colors w-24"
          />
        )}
        <Toggle enabled={enabled} onChange={onToggle} />
      </div>
    </div>
  )
}
