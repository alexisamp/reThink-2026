import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Icon } from '@/screens/today/TodayIcons'

type BatchPayload = {
  urls: string[]
  createdAt: number
}

function readPayload(key: string | null): BatchPayload | null {
  if (!key) return null
  try {
    const raw = window.localStorage.getItem(`rethink.linkedinBatch.${key}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<BatchPayload>
    const urls = Array.isArray(parsed.urls) ? parsed.urls.filter((url): url is string => typeof url === 'string') : []
    if (!urls.length) return null
    return { urls, createdAt: Number(parsed.createdAt ?? Date.now()) }
  } catch {
    return null
  }
}

export default function LinkedInBatchLauncher() {
  const [searchParams] = useSearchParams()
  const key = searchParams.get('key')
  const payload = useMemo(() => readPayload(key), [key])
  const [opened, setOpened] = useState(0)
  const attempted = useRef(false)

  const openAll = () => {
    if (!payload) return
    let count = 0
    for (const url of payload.urls) {
      const tab = window.open(url, '_blank', 'noopener,noreferrer')
      if (tab) count += 1
    }
    setOpened(count)
  }

  useEffect(() => {
    if (attempted.current) return
    attempted.current = true
    openAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload])

  if (!payload) {
    return <main className="batch-launcher"><div className="batch-card"><Icon name="linkedin" size={22} /><h1>No LinkedIn batch found</h1><p>Go back to the People list and press Open LinkedIn profiles again.</p></div></main>
  }

  return <main className="batch-launcher"><div className="batch-card"><Icon name="linkedin" size={22} /><h1>Opening LinkedIn profiles</h1><p>Opened {opened} of {payload.urls.length}. If Chrome blocked some tabs, press the button below.</p><button className="btn btn-primary" onClick={openAll}><Icon name="arrowUpRight" size={13} />Open remaining profiles</button><div className="batch-links">{payload.urls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer">{index + 1}. {url.replace(/^https:\/\/www\.linkedin\.com\/in\//, '').replace(/\/$/, '')}</a>)}</div></div></main>
}
