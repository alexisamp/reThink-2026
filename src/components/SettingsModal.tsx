import { useEffect, useState } from 'react'
import { X, ArrowClockwise, CheckCircle, WarningCircle, DownloadSimple, RocketLaunch, Eye, EyeSlash } from '@phosphor-icons/react'
import type { UpdaterState } from '@/hooks/useUpdater'
import { supabase } from '@/lib/supabase'

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

export default function SettingsModal({ open, onClose, updater }: SettingsModalProps) {
  const [appVersion, setAppVersion] = useState<string>('')
  const [attioKey, setAttioKey] = useState('')
  const [attioKeyVisible, setAttioKeyVisible] = useState(false)
  const [attioSaved, setAttioSaved] = useState(false)
  const [chromeExtCopied, setChromeExtCopied] = useState(false)

  useEffect(() => {
    if (open) setAttioKey(localStorage.getItem('attio_api_key') ?? '')
  }, [open])

  const copyExtensionCode = async () => {
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
      const code = btoa(JSON.stringify(payload))
      await navigator.clipboard.writeText(code)
      setChromeExtCopied(true)
      setTimeout(() => setChromeExtCopied(false), 2000)
    } catch (_err) {
      // silently fail — clipboard may be unavailable
    }
  }

  const saveAttioKey = () => {
    const trimmed = attioKey.trim()
    if (trimmed) {
      localStorage.setItem('attio_api_key', trimmed)
    } else {
      localStorage.removeItem('attio_api_key')
    }
    setAttioSaved(true)
    setTimeout(() => setAttioSaved(false), 2000)
  }

  // Get current version from Tauri
  useEffect(() => {
    if (!updater.isTauri) return
    import('@tauri-apps/api/app').then(({ getVersion }) =>
      getVersion().then(setAppVersion).catch(() => {})
    )
  }, [updater.isTauri])

  if (!open) return null

  const statusLabel: Record<typeof updater.status, string> = {
    idle: '',
    checking: 'Buscando actualizaciones...',
    'up-to-date': 'Estás en la versión más reciente.',
    available: `Nueva versión disponible: ${updater.update?.version}`,
    downloading: `Descargando... ${updater.progress}%`,
    ready: 'Descarga completa. Listo para reiniciar.',
    error: updater.error ?? 'Error al buscar actualizaciones.',
  }

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/20 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white border border-mercury rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-mercury">
          <h2 className="text-sm font-semibold text-burnham">Settings</h2>
          <button
            onClick={onClose}
            className="text-shuttle hover:text-burnham transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-5">

          {/* App version */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-shuttle/50">Versión</p>
            <p className="text-sm text-burnham font-medium">
              reThink {appVersion || '—'}
            </p>
            {updater.lastChecked && (
              <p className="text-[11px] text-shuttle/60">
                Última búsqueda: {updater.lastChecked.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>

          {/* Integrations */}
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-shuttle/50">Integrations</p>

            {/* Chrome Extension */}
            <div>
              <p className="text-xs font-medium text-burnham mb-0.5">Chrome Extension</p>
              <p className="text-[10px] text-shuttle/60 mb-2">Paste this code in the extension popup to connect</p>
              <button
                onClick={copyExtensionCode}
                className="px-3 py-2 text-xs font-medium bg-burnham text-white rounded-lg hover:bg-burnham/90 transition-colors"
              >
                {chromeExtCopied ? 'Copied ✓' : 'Copy connect code'}
              </button>
            </div>

            <div>
              <p className="text-xs font-medium text-burnham mb-1.5">Attio API key</p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={attioKeyVisible ? 'text' : 'password'}
                    value={attioKey}
                    onChange={e => setAttioKey(e.target.value)}
                    onBlur={saveAttioKey}
                    onKeyDown={e => { if (e.key === 'Enter') saveAttioKey() }}
                    placeholder="Bearer token…"
                    className="w-full text-xs text-burnham border border-mercury rounded-lg px-3 py-2 pr-8 focus:outline-none focus:border-shuttle transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setAttioKeyVisible(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-shuttle/40 hover:text-shuttle transition-colors"
                  >
                    {attioKeyVisible ? <EyeSlash size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                <button
                  onClick={saveAttioKey}
                  className="px-3 py-2 text-xs font-medium bg-burnham text-white rounded-lg hover:bg-burnham/90 transition-colors shrink-0"
                >
                  Save
                </button>
              </div>
              <p className="text-[10px] mt-1 font-mono">
                {attioSaved
                  ? <span className="text-pastel">Saved ✓</span>
                  : attioKey.trim()
                    ? <span className="text-shuttle/40">Configured</span>
                    : <span className="text-shuttle/30">Not configured</span>
                }
              </p>
            </div>
          </div>

          {/* Update section */}
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-shuttle/50">Actualizaciones</p>

            {/* Status message */}
            {updater.status !== 'idle' && (
              <div className={[
                'flex items-start gap-2 text-xs px-3 py-2.5 rounded-lg',
                updater.status === 'error'      ? 'bg-red-50 text-red-600' :
                updater.status === 'available'  ? 'bg-gossip/30 text-burnham' :
                updater.status === 'up-to-date' ? 'bg-mercury/20 text-shuttle' :
                updater.status === 'ready'      ? 'bg-gossip/40 text-burnham' :
                'bg-mercury/20 text-shuttle',
              ].join(' ')}>
                {updater.status === 'error' && <WarningCircle size={14} className="shrink-0 mt-0.5" />}
                {updater.status === 'up-to-date' && <CheckCircle size={14} className="shrink-0 mt-0.5 text-pastel" />}
                {updater.status === 'ready' && <CheckCircle size={14} className="shrink-0 mt-0.5 text-pastel" />}
                <span>{statusLabel[updater.status]}</span>
              </div>
            )}

            {/* Progress bar — only during download */}
            {updater.status === 'downloading' && (
              <div className="w-full bg-mercury/40 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-pastel rounded-full transition-all duration-200"
                  style={{ width: `${updater.progress}%` }}
                />
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2">
              {/* Check for updates */}
              {(updater.status === 'idle' || updater.status === 'up-to-date' || updater.status === 'error') && (
                <button
                  onClick={updater.checkForUpdates}
                  disabled={!updater.isTauri}
                  className="flex-1 flex items-center justify-center gap-2 text-xs font-medium bg-burnham text-white px-3 py-2 rounded-lg hover:bg-burnham/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowClockwise size={13} />
                  Buscar actualizaciones
                </button>
              )}

              {/* Checking spinner */}
              {updater.status === 'checking' && (
                <div className="flex-1 flex items-center justify-center gap-2 text-xs text-shuttle px-3 py-2">
                  <div className="w-3 h-3 border border-shuttle border-t-transparent rounded-full animate-spin" />
                  Buscando...
                </div>
              )}

              {/* Download button */}
              {updater.status === 'available' && (
                <button
                  onClick={updater.downloadAndInstall}
                  className="flex-1 flex items-center justify-center gap-2 text-xs font-medium bg-burnham text-white px-3 py-2 rounded-lg hover:bg-burnham/90 transition-colors"
                >
                  <DownloadSimple size={13} />
                  Instalar v{updater.update?.version}
                </button>
              )}

              {/* Restart button */}
              {updater.status === 'ready' && (
                <button
                  onClick={updater.restartApp}
                  className="flex-1 flex items-center justify-center gap-2 text-xs font-medium bg-pastel text-burnham px-3 py-2 rounded-lg hover:bg-pastel/90 transition-colors"
                >
                  <RocketLaunch size={13} />
                  Reiniciar y actualizar
                </button>
              )}

              {/* Downloading — disabled state */}
              {updater.status === 'downloading' && (
                <div className="flex-1 flex items-center justify-center gap-2 text-xs text-shuttle px-3 py-2">
                  <div className="w-3 h-3 border border-shuttle border-t-transparent rounded-full animate-spin" />
                  Descargando {updater.progress}%
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
