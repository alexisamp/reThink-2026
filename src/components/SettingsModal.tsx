import { useEffect, useState } from 'react'
import {
  X, ArrowClockwise, CheckCircle, WarningCircle, DownloadSimple, RocketLaunch,
  Eye, EyeSlash, TrashSimple, Plugs, FunnelSimple, ArrowsClockwise,
  PuzzlePiece, UserCircle, Bell, Timer, SignOut,
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

type Section = 'profile' | 'notifications' | 'focus' | 'integrations' | 'funnel' | 'updates'

const SECTIONS: { id: Section; label: string; description: string; Icon: React.ElementType }[] = [
  { id: 'profile',       label: 'Profile',              description: 'Your account info and sign out.',                Icon: UserCircle },
  { id: 'notifications', label: 'Notifications',         description: 'Configure when the app sends reminders.',       Icon: Bell },
  { id: 'focus',         label: 'Focus',                 description: 'Pomodoro defaults and ambient sound.',          Icon: Timer },
  { id: 'integrations',  label: 'Integrations',          description: 'Connect external tools and services.',          Icon: Plugs },
  { id: 'funnel',        label: 'Relationship Funnel',   description: 'Customize your pipeline stages and criteria.',  Icon: FunnelSimple },
  { id: 'updates',       label: 'Updates',               description: 'Manage app version and auto-update settings.',  Icon: ArrowsClockwise },
]

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const FOCUS_DURATIONS = [
  { minutes: 25, label: '25 min', desc: 'Pomodoro' },
  { minutes: 52, label: '52 min', desc: 'Ultradian' },
  { minutes: 90, label: '90 min', desc: 'Deep Work' },
]

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

  const saveAttioKey = () => {
    const trimmed = attioKey.trim()
    if (trimmed) localStorage.setItem('attio_api_key', trimmed)
    else localStorage.removeItem('attio_api_key')
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
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/25 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        className="w-[820px] h-[580px] bg-white rounded-2xl shadow-2xl overflow-hidden flex border border-mercury/70"
        style={{ boxShadow: '0 24px 64px rgba(0,55,32,0.14), 0 4px 16px rgba(0,0,0,0.08)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Left Sidebar ── */}
        <div className="w-[210px] bg-[#F8FAF8] border-r border-mercury/50 flex flex-col shrink-0">

          {/* User identity */}
          <div className="px-4 pt-5 pb-4">
            <div className="flex items-center gap-2.5">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-9 h-9 rounded-full shrink-0 ring-1 ring-mercury" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-burnham flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {initials}
                </div>
              )}
              <div className="overflow-hidden min-w-0">
                <p className="text-xs font-semibold text-burnham truncate leading-tight">{fullName || 'User'}</p>
                <p className="text-[10px] text-shuttle/55 truncate leading-tight mt-0.5">{email}</p>
              </div>
            </div>
          </div>

          <div className="mx-4 border-t border-mercury/50" />

          {/* Nav items */}
          <nav className="flex-1 px-2 py-3 space-y-0.5">
            {SECTIONS.map(({ id, label, Icon }) => {
              const isActive = section === id
              const isUpdates = id === 'updates'
              return (
                <button
                  key={id}
                  onClick={() => setSection(id)}
                  className={[
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-all duration-150 text-left',
                    isActive
                      ? 'bg-gossip/70 text-burnham font-medium shadow-sm'
                      : 'text-shuttle hover:bg-mercury/40 hover:text-burnham',
                  ].join(' ')}
                >
                  <Icon size={14} weight={isActive ? 'bold' : 'regular'} className="shrink-0" />
                  <span className="flex-1">{label}</span>
                  {isUpdates && showUpdateDot && (
                    <span className="w-1.5 h-1.5 rounded-full bg-pastel shrink-0" />
                  )}
                </button>
              )
            })}
          </nav>

          {/* Close */}
          <div className="px-3 pb-4">
            <button
              onClick={onClose}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-shuttle/60 hover:text-shuttle hover:bg-mercury/30 rounded-lg transition-all"
            >
              <X size={13} />
              Close
            </button>
          </div>
        </div>

        {/* ── Right Content ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Section header */}
          <div className="px-8 pt-7 pb-5 border-b border-mercury/40">
            <h1 className="text-base font-semibold text-burnham tracking-tight">
              {SECTIONS.find(s => s.id === section)?.label}
            </h1>
            <p className="text-[11px] text-shuttle/55 mt-0.5">
              {SECTIONS.find(s => s.id === section)?.description}
            </p>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-8 py-6">

            {/* ── PROFILE ── */}
            {section === 'profile' && (
              <div className="space-y-5">
                {/* Avatar + name block */}
                <div className="flex items-center gap-4 p-4 border border-mercury/70 rounded-xl bg-[#FAFAF9]">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-14 h-14 rounded-full ring-2 ring-mercury shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-burnham flex items-center justify-center text-white text-xl font-bold shrink-0">
                      {initials}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-burnham">{fullName || 'User'}</p>
                    <p className="text-xs text-shuttle/60 mt-0.5">{email}</p>
                    <p className="text-[10px] text-shuttle/40 mt-1">Signed in with Google</p>
                  </div>
                </div>

                {/* App version */}
                <SettingRow
                  label="App version"
                  description="Your current installed version of reThink."
                >
                  <span className="text-xs font-mono text-burnham bg-mercury/30 px-2.5 py-1 rounded-md">
                    {appVersion ? `v${appVersion}` : '—'}
                  </span>
                </SettingRow>

                {/* Sign out */}
                <div className="pt-1">
                  <button
                    onClick={() => { supabase.auth.signOut(); onClose() }}
                    className="flex items-center gap-2 text-xs text-red-500 hover:text-red-600 border border-red-200 hover:border-red-300 px-4 py-2 rounded-lg transition-all hover:bg-red-50"
                  >
                    <SignOut size={13} />
                    Sign out
                  </button>
                </div>
              </div>
            )}

            {/* ── NOTIFICATIONS ── */}
            {section === 'notifications' && (
              <div className="space-y-px">

                {/* Morning Brief */}
                <NotifRow
                  label="Morning Brief"
                  description="Daily summary of your habits and One Thing."
                  enabled={settings.notifMorningEnabled}
                  time={settings.notifMorningTime}
                  onToggle={v => updateSettings({ notifMorningEnabled: v })}
                  onTimeChange={v => updateSettings({ notifMorningTime: v })}
                />

                {/* Streak at Risk */}
                <NotifRow
                  label="Streak at Risk"
                  description="Evening reminder for habits not yet logged."
                  enabled={settings.notifEveningEnabled}
                  time={settings.notifEveningTime}
                  onToggle={v => updateSettings({ notifEveningEnabled: v })}
                  onTimeChange={v => updateSettings({ notifEveningTime: v })}
                />

                {/* Weekly Review */}
                <div className="flex items-start justify-between gap-4 py-3.5 border-b border-mercury/40 last:border-0">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-burnham leading-tight">Weekly Review</p>
                      <p className="text-[10px] text-shuttle/50 mt-0.5">Reminder to complete your weekly review.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {settings.notifWeeklyEnabled && (
                      <>
                        <select
                          value={settings.notifWeeklyDay}
                          onChange={e => updateSettings({ notifWeeklyDay: Number(e.target.value) })}
                          className="text-[11px] text-burnham border border-mercury rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-shuttle/50 transition-colors"
                        >
                          {DAYS.map((d, i) => (
                            <option key={d} value={i}>{d}</option>
                          ))}
                        </select>
                        <input
                          type="time"
                          value={settings.notifWeeklyTime}
                          onChange={e => updateSettings({ notifWeeklyTime: e.target.value })}
                          className="text-[11px] text-burnham border border-mercury rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-shuttle/50 transition-colors w-24"
                        />
                      </>
                    )}
                    <Toggle
                      enabled={settings.notifWeeklyEnabled}
                      onChange={v => updateSettings({ notifWeeklyEnabled: v })}
                    />
                  </div>
                </div>

              </div>
            )}

            {/* ── FOCUS ── */}
            {section === 'focus' && (
              <div className="space-y-6">

                {/* Default duration */}
                <div>
                  <p className="text-xs font-medium text-burnham mb-1">Default session duration</p>
                  <p className="text-[10px] text-shuttle/50 mb-3">Sets the timer when you open a new focus session.</p>
                  <div className="flex gap-2">
                    {FOCUS_DURATIONS.map(({ minutes, label, desc }) => (
                      <button
                        key={minutes}
                        onClick={() => updateSettings({ focusDefaultMinutes: minutes })}
                        className={[
                          'flex-1 py-2.5 px-3 rounded-xl border text-xs transition-all',
                          settings.focusDefaultMinutes === minutes
                            ? 'border-burnham bg-burnham/5 text-burnham font-semibold'
                            : 'border-mercury text-shuttle hover:border-shuttle/40 hover:text-burnham',
                        ].join(' ')}
                      >
                        <div className="font-semibold text-sm">{label}</div>
                        <div className="text-[10px] opacity-60 mt-0.5">{desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Ambient sound default */}
                <div>
                  <p className="text-xs font-medium text-burnham mb-1">Default ambient sound</p>
                  <p className="text-[10px] text-shuttle/50 mb-3">Plays automatically when a focus session starts.</p>
                  <div className="flex gap-2">
                    {(['none', 'brown', 'rain'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => updateSettings({ focusAmbientSound: s })}
                        className={[
                          'flex-1 py-2 px-3 rounded-lg border text-xs transition-all',
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

                {/* Volume */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-burnham">Ambient volume</p>
                    <span className="text-[10px] text-shuttle/50 font-mono">
                      {Math.round(settings.focusAmbientVolume * 100)}%
                    </span>
                  </div>
                  <p className="text-[10px] text-shuttle/50 mb-3">Volume level for ambient sounds during focus.</p>
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

            {/* ── INTEGRATIONS ── */}
            {section === 'integrations' && (
              <div className="space-y-5">

                <SettingCard
                  icon={<PuzzlePiece size={15} className="text-shuttle/60" />}
                  label="Chrome Extension"
                  description="Generate a one-time code and paste it in the extension popup to connect your account."
                >
                  {!chromeExtCode ? (
                    <button
                      onClick={generateExtensionCode}
                      className="px-3.5 py-1.5 text-xs font-medium bg-burnham text-white rounded-lg hover:bg-burnham/90 transition-colors"
                    >
                      Generate connect code
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        readOnly
                        value={chromeExtCode}
                        onFocus={e => e.target.select()}
                        className="flex-1 px-2.5 py-1.5 text-[10px] font-mono bg-mercury/30 border border-mercury rounded-lg text-shuttle truncate cursor-text min-w-0"
                      />
                      <button
                        onClick={copyExtensionCode}
                        className="shrink-0 px-3 py-1.5 text-xs font-medium bg-burnham text-white rounded-lg hover:bg-burnham/90 transition-colors"
                      >
                        {chromeExtCopied ? 'Copied ✓' : 'Copy'}
                      </button>
                    </div>
                  )}
                </SettingCard>

                <SettingCard
                  icon={<Plugs size={15} className="text-shuttle/60" />}
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
                        className="w-full text-xs text-burnham border border-mercury rounded-lg px-3 py-2 pr-8 focus:outline-none focus:border-shuttle/50 transition-colors bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setAttioKeyVisible(v => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-shuttle/40 hover:text-shuttle transition-colors"
                      >
                        {attioKeyVisible ? <EyeSlash size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                    <button
                      onClick={saveAttioKey}
                      className="shrink-0 px-3.5 py-2 text-xs font-medium bg-burnham text-white rounded-lg hover:bg-burnham/90 transition-colors"
                    >
                      Save
                    </button>
                  </div>
                  <p className="text-[10px] mt-1.5 font-mono">
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
                    <div key={status} className="border border-mercury rounded-xl p-4 space-y-3 bg-white">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-shuttle/60">{status}</span>
                        {isDeletable && (
                          <button
                            onClick={() => { setDeletingStage(status); setMigrateTo('PROSPECT'); setDeleteConfirmed(false) }}
                            className="text-shuttle/30 hover:text-red-400 transition-colors p-1 rounded hover:bg-red-50"
                            title={`Delete ${status} stage`}
                          >
                            <TrashSimple size={12} />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[9px] text-shuttle/50 uppercase tracking-wide block mb-1">Label</label>
                          <input
                            type="text"
                            defaultValue={cfg.label}
                            onBlur={e => updateStage(status, { label: e.target.value })}
                            className="w-full text-xs text-burnham border border-mercury rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-shuttle/50 transition-colors bg-[#FAFAF9]"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] text-shuttle/50 uppercase tracking-wide block mb-1">Description</label>
                          <input
                            type="text"
                            defaultValue={cfg.description}
                            onBlur={e => updateStage(status, { description: e.target.value })}
                            className="w-full text-xs text-burnham border border-mercury rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-shuttle/50 transition-colors bg-[#FAFAF9]"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] text-shuttle/50 uppercase tracking-wide block mb-1">Entry criteria</label>
                          <textarea
                            rows={2}
                            defaultValue={cfg.entry_criteria}
                            onBlur={e => updateStage(status, { entry_criteria: e.target.value })}
                            className="w-full text-xs text-burnham border border-mercury rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-shuttle/50 transition-colors resize-none bg-[#FAFAF9]"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] text-shuttle/50 uppercase tracking-wide block mb-1">Exit criteria</label>
                          <textarea
                            rows={2}
                            defaultValue={cfg.exit_criteria}
                            onBlur={e => updateStage(status, { exit_criteria: e.target.value })}
                            className="w-full text-xs text-burnham border border-mercury rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-shuttle/50 transition-colors resize-none bg-[#FAFAF9]"
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}

                {deletingStage && (
                  <div className="border border-red-200 bg-red-50/60 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-semibold text-red-700">
                      Delete stage "{config[deletingStage]?.label ?? deletingStage}"?
                    </p>
                    <p className="text-[10px] text-red-600/80">
                      All contacts in this stage will be moved to the selected stage before deletion.
                    </p>
                    <div>
                      <label className="text-[9px] text-red-600/70 uppercase tracking-wide block mb-1">Move contacts to</label>
                      <select
                        value={migrateTo}
                        onChange={e => setMigrateTo(e.target.value as ContactStatus)}
                        className="text-xs text-burnham border border-red-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none"
                      >
                        {FUNNEL_STAGE_ORDER.filter(s => s !== deletingStage && getActiveStages().includes(s)).map(s => (
                          <option key={s} value={s}>{config[s]?.label ?? s}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setDeletingStage(null)}
                        className="flex-1 text-xs text-shuttle/60 border border-mercury rounded-lg px-3 py-1.5 hover:bg-mercury/20 transition-colors"
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
                        className="flex-1 text-xs bg-red-500 text-white rounded-lg px-3 py-1.5 hover:bg-red-600 transition-colors font-medium"
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
                  <span className="text-xs font-mono text-burnham bg-mercury/30 px-2.5 py-1 rounded-md">
                    {appVersion ? `v${appVersion}` : '—'}
                  </span>
                </SettingRow>

                {updater.status !== 'idle' && (
                  <div className={[
                    'flex items-start gap-2.5 text-xs px-4 py-3 rounded-xl border',
                    updater.status === 'error'
                      ? 'bg-red-50 text-red-600 border-red-200'
                      : updater.status === 'available' || updater.status === 'ready'
                        ? 'bg-gossip/30 text-burnham border-gossip/60'
                        : 'bg-mercury/15 text-shuttle border-mercury/40',
                  ].join(' ')}>
                    {updater.status === 'error'      && <WarningCircle size={14} className="shrink-0 mt-0.5" />}
                    {updater.status === 'up-to-date' && <CheckCircle size={14} className="shrink-0 mt-0.5 text-pastel" />}
                    {updater.status === 'ready'      && <CheckCircle size={14} className="shrink-0 mt-0.5 text-pastel" />}
                    {updater.status === 'available'  && <DownloadSimple size={14} className="shrink-0 mt-0.5 text-burnham" />}
                    <span>{statusLabel[updater.status]}</span>
                  </div>
                )}

                {updater.status === 'downloading' && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[10px] text-shuttle/50">
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
                      className="flex items-center gap-2 text-xs font-medium bg-burnham text-white px-4 py-2.5 rounded-lg hover:bg-burnham/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ArrowClockwise size={13} />
                      Check for updates
                    </button>
                  )}

                  {updater.status === 'checking' && (
                    <div className="flex items-center gap-2 text-xs text-shuttle py-2">
                      <div className="w-3.5 h-3.5 border border-shuttle border-t-transparent rounded-full animate-spin" />
                      Checking for updates…
                    </div>
                  )}

                  {updater.status === 'available' && (
                    <button
                      onClick={updater.downloadAndInstall}
                      className="flex items-center gap-2 text-xs font-medium bg-burnham text-white px-4 py-2.5 rounded-lg hover:bg-burnham/90 transition-colors"
                    >
                      <DownloadSimple size={13} />
                      Install v{updater.update?.version}
                    </button>
                  )}

                  {updater.status === 'ready' && (
                    <button
                      onClick={updater.restartApp}
                      className="flex items-center gap-2 text-xs font-medium bg-gossip text-burnham px-4 py-2.5 rounded-lg hover:bg-gossip/80 transition-colors font-semibold"
                    >
                      <RocketLaunch size={13} />
                      Restart and update
                    </button>
                  )}

                  {updater.status === 'downloading' && (
                    <div className="flex items-center gap-2 text-xs text-shuttle py-2">
                      <div className="w-3.5 h-3.5 border border-shuttle border-t-transparent rounded-full animate-spin" />
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
    <div className="flex items-center justify-between gap-4 py-3 border-b border-mercury/40 last:border-0">
      <div className="min-w-0">
        <p className="text-xs font-medium text-burnham leading-tight">{label}</p>
        {description && (
          <p className="text-[10px] text-shuttle/50 mt-0.5 leading-relaxed">{description}</p>
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
    <div className="border border-mercury/70 rounded-xl p-4 space-y-2 bg-white">
      <div className="flex items-center gap-2">
        <span className="shrink-0">{icon}</span>
        <p className="text-xs font-semibold text-burnham">{label}</p>
      </div>
      {description && (
        <p className="text-[10px] text-shuttle/55 leading-relaxed">{description}</p>
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
        'relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0',
        enabled ? 'bg-burnham' : 'bg-mercury',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200',
          enabled ? 'translate-x-4' : 'translate-x-0.5',
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
    <div className="flex items-start justify-between gap-4 py-3.5 border-b border-mercury/40 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-burnham leading-tight">{label}</p>
        <p className="text-[10px] text-shuttle/50 mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {enabled && (
          <input
            type="time"
            value={time}
            onChange={e => onTimeChange(e.target.value)}
            className="text-[11px] text-burnham border border-mercury rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-shuttle/50 transition-colors w-24"
          />
        )}
        <Toggle enabled={enabled} onChange={onToggle} />
      </div>
    </div>
  )
}
