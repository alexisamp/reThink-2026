import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export default function CrmPopFrame({
  anchor,
  width,
  align = 'left',
  onClose,
  children,
  className = '',
}: {
  anchor: DOMRect
  width: number
  align?: 'left' | 'right'
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const style: CSSProperties = { position: 'fixed', minWidth: width, width }
  const estimatedHeight = 320
  if (anchor.bottom + 6 + estimatedHeight > window.innerHeight && anchor.top > estimatedHeight) style.bottom = window.innerHeight - anchor.top + 6
  else style.top = anchor.bottom + 6
  if (align === 'right') style.right = Math.max(8, window.innerWidth - anchor.right)
  else style.left = Math.min(Math.max(8, anchor.left), window.innerWidth - width - 8)

  return createPortal(
    <>
      <div className="crm-pop-scrim" onClick={onClose} />
      <div className={`pop crm-pop ${className}`.trim()} style={style} onClick={event => event.stopPropagation()}>
        {children}
      </div>
    </>,
    document.body,
  )
}
