import { House } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'

interface BreadcrumbProps {
  items: { label: string; path?: string }[]
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  const navigate = useNavigate()
  return (
    <nav className="flex items-center gap-2 text-xs font-medium text-shuttle mb-6">
      <button
        onClick={() => navigate('/today')}
        className="hover:text-burnham transition-colors flex items-center gap-1"
      >
        <House size={14} />
      </button>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-2">
          <span className="text-mercury">/</span>
          {item.path ? (
            <button
              onClick={() => navigate(item.path!)}
              className="hover:text-burnham transition-colors"
            >
              {item.label}
            </button>
          ) : (
            <span className="text-burnham font-semibold">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
