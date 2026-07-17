import { ICON_PATHS, Icon, type TodayIconName } from '@/screens/today/TodayIcons'
import { supabase } from '@/lib/supabase'

export function listLineIconName(value: string | null | undefined): TodayIconName | null {
  if (!value) return null
  const candidate = value.startsWith('icon:') ? value.slice(5) : value
  return candidate in ICON_PATHS ? candidate as TodayIconName : null
}

export function listUploadedIconUrl(value: string | null | undefined) {
  if (!value?.startsWith('storage:list-icons:')) return null
  const path = value.slice('storage:list-icons:'.length)
  if (!path) return null
  return supabase.storage.from('list-icons').getPublicUrl(path).data.publicUrl
}

export default function ListGlyph({ value, size = 14, className = 'emoji' }: { value?: string | null; size?: number; className?: string }) {
  const uploadedUrl = listUploadedIconUrl(value)
  if (uploadedUrl) return <span className={`${className} list-uploaded-icon`} style={{ width: size, height: size }}><img src={uploadedUrl} alt="" /></span>
  const iconName = listLineIconName(value)
  if (iconName) return <span className={`${className} list-line-icon`}><Icon name={iconName} size={size} /></span>
  return <span className={className}>{value || '•'}</span>
}
