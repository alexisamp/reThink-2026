import { useEffect, useState } from 'react'
import { X, ArrowClockwise, CheckCircle, WarningCircle, DownloadSimple, RocketLaunch } from '@phosphor-icons/react'
import type { UpdaterState } from '@/hooks/useUpdater'

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
