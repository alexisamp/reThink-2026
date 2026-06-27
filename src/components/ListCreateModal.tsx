import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Buildings, CaretLeft, Users, X, Target } from '@phosphor-icons/react'
import { useAuth } from '@/hooks/useAuth'
import { LIST_OBJECT_LABELS, useLists } from '@/hooks/useLists'
import type { List, ListRecordKind } from '@/types'

interface ListCreateModalProps {
  open: boolean
  onClose: () => void
  onCreated: (list: List) => void
}

const OBJECTS: Array<{
  id: ListRecordKind
  title: string
  subtitle: string
  icon: ReactNode
  color: string
}> = [
  {
    id: 'company',
    title: 'Companies',
    subtitle: 'Accounts, targets, partners, and organizations.',
    icon: <Buildings size={16} weight="fill" />,
    color: '#3b6ce8',
  },
  {
    id: 'person',
    title: 'People',
    subtitle: 'Contacts, candidates, mentors, and relationships.',
    icon: <Users size={16} weight="fill" />,
    color: '#3b6ce8',
  },
  {
    id: 'opportunity',
    title: 'Deals',
    subtitle: 'Opportunities, roles, projects, and revenue motions.',
    icon: <Target size={16} weight="fill" />,
    color: '#ff6b2c',
  },
]

const EMOJI_OPTIONS: Array<{ emoji: string; terms: string }> = [
  { emoji: '😀', terms: 'grinning smile happy face' },
  { emoji: '😃', terms: 'smile happy open face' },
  { emoji: '😁', terms: 'beam grin smile happy' },
  { emoji: '😄', terms: 'laugh smile happy' },
  { emoji: '😆', terms: 'laugh squint smile' },
  { emoji: '😅', terms: 'sweat smile relief' },
  { emoji: '🤣', terms: 'rolling laugh funny' },
  { emoji: '😂', terms: 'joy laugh tears' },
  { emoji: '🙂', terms: 'slight smile' },
  { emoji: '🙃', terms: 'upside down smile' },
  { emoji: '😉', terms: 'wink playful' },
  { emoji: '😊', terms: 'blush smile happy' },
  { emoji: '😇', terms: 'angel halo' },
  { emoji: '🥰', terms: 'love hearts smile' },
  { emoji: '😍', terms: 'heart eyes love' },
  { emoji: '🤩', terms: 'star eyes excited' },
  { emoji: '😘', terms: 'kiss love' },
  { emoji: '😋', terms: 'yum tongue' },
  { emoji: '🤪', terms: 'zany silly' },
  { emoji: '🤑', terms: 'money deal revenue' },
  { emoji: '🤗', terms: 'hug thanks' },
  { emoji: '🤔', terms: 'thinking think' },
  { emoji: '😐', terms: 'neutral' },
  { emoji: '😴', terms: 'sleep sleepy' },
  { emoji: '🤒', terms: 'sick thermometer' },
  { emoji: '🥵', terms: 'hot' },
  { emoji: '🥶', terms: 'cold' },
  { emoji: '🤯', terms: 'mind blown' },
  { emoji: '🥳', terms: 'party celebrate' },
  { emoji: '😎', terms: 'cool sunglasses' },
  { emoji: '🤓', terms: 'nerd smart' },
  { emoji: '🧐', terms: 'inspect monocle research' },
  { emoji: '🔥', terms: 'fire hot priority job hunt' },
  { emoji: '🚀', terms: 'rocket launch startup growth' },
  { emoji: '🤝', terms: 'handshake partner partners relationship' },
  { emoji: '☘️', terms: 'clover luck revenue funnel' },
  { emoji: '📋', terms: 'clipboard list lists task' },
  { emoji: '🏢', terms: 'company companies building account' },
  { emoji: '👤', terms: 'person people contact user' },
  { emoji: '💼', terms: 'deal deals work business opportunity' },
  { emoji: '💰', terms: 'money revenue sales' },
  { emoji: '🎯', terms: 'target goal focus' },
  { emoji: '⭐', terms: 'star favorite important' },
]

export default function ListCreateModal({ open, onClose, onCreated }: ListCreateModalProps) {
  const { user } = useAuth()
  const { createList } = useLists(user?.id)
  const [selectedObject, setSelectedObject] = useState<ListRecordKind | null>(null)
  const [emoji, setEmoji] = useState('')
  const [name, setName] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [emojiQuery, setEmojiQuery] = useState('')
  const [saving, setSaving] = useState(false)

  const effectiveEmoji = useMemo(() => {
    if (emoji.trim()) return emoji.trim()
    if (!selectedObject) return ''
    return LIST_OBJECT_LABELS[selectedObject].icon
  }, [emoji, selectedObject])

  useEffect(() => {
    if (!open) return
    setSelectedObject('company')
    setEmoji(LIST_OBJECT_LABELS.company.icon)
    setName('New list')
    setEmojiOpen(false)
    setEmojiQuery('')
  }, [open])

  if (!open) return null

  async function handleCreate() {
    if (!selectedObject || !name.trim() || saving) return
    setSaving(true)
    const list = await createList({
      name,
      icon: effectiveEmoji,
      parent_object: selectedObject,
    })
    setSaving(false)
    if (list) {
      setSelectedObject(null)
      setEmoji('')
      setName('')
      onCreated(list)
    }
  }

  const normalizedEmojiQuery = emojiQuery.trim().toLowerCase()
  const filteredEmojis = normalizedEmojiQuery
    ? EMOJI_OPTIONS.filter(option => option.emoji.includes(normalizedEmojiQuery) || option.terms.includes(normalizedEmojiQuery))
    : EMOJI_OPTIONS

  return (
    <div className="atl-modal-backdrop atl-list-create-backdrop" onMouseDown={onClose}>
      <div
        className="atl-modal md atl-list-create-modal"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="atl-modal-head">
          <div className="atl-crumbs">
            <button className="atl-crumb-back" type="button" aria-label="Back" onClick={onClose}>
              <CaretLeft size={18} />
            </button>
            <span>Templates</span>
            <span className="slash">/</span>
            <strong>Start from scratch</strong>
          </div>
          <button onClick={onClose} className="atl-x" title="Close">
            <X size={20} />
          </button>
        </div>

        <div className="atl-modal-body">
          <div className="atl-form-label">Object</div>
          <div className="atl-list-object-grid">
            {OBJECTS.map(object => {
              const active = selectedObject === object.id
              return (
                <button
                  key={object.id}
                  onClick={() => {
                    const previousDefaultEmoji = selectedObject ? LIST_OBJECT_LABELS[selectedObject].icon : ''
                    setSelectedObject(object.id)
                    if (!emoji.trim() || emoji === previousDefaultEmoji) setEmoji(LIST_OBJECT_LABELS[object.id].icon)
                  }}
                  className={`atl-type-card ${active ? 'active' : ''}`}
                >
                  <span className="atl-object-icon" style={{ background: object.color }}>
                    {object.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="atl-type-title">{object.title}</span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="atl-list-name-row">
            <div className="atl-emoji-anchor">
              <button
                type="button"
                onClick={() => setEmojiOpen(prev => !prev)}
                className="atl-emoji-button"
                aria-label="Choose emoji"
              >
                {effectiveEmoji || '✨'}
              </button>
              {emojiOpen && (
                <div className="atl-emoji-popover">
                  <input
                    value={emojiQuery}
                    onChange={event => setEmojiQuery(event.target.value)}
                    className="atl-emoji-search"
                    placeholder="Search Emojis"
                    autoFocus
                  />
                  <div className="atl-emoji-section">Smileys &amp; Emotion</div>
                  <div className="atl-emoji-grid">
                    {filteredEmojis.map(({ emoji: item }) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          setEmoji(item)
                          setEmojiOpen(false)
                        }}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                  {filteredEmojis.length === 0 && (
                    <div className="atl-emoji-empty">No emojis found</div>
                  )}
                </div>
              )}
            </div>
            <label className="block">
              <span className="atl-form-label">List name</span>
              <input
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder={selectedObject ? `${LIST_OBJECT_LABELS[selectedObject].plural} list` : 'Name your list'}
                className="atl-input"
                autoFocus
              />
            </label>
          </div>
        </div>

        <div className="atl-modal-foot">
          <button onClick={onClose} className="atl-button atl-button-with-key">
            Cancel <span className="atl-key small">ESC</span>
          </button>
          <button
            onClick={handleCreate}
            disabled={!selectedObject || !name.trim() || saving}
            className="atl-button primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            Create list <span className="atl-key primary-key">↵</span>
          </button>
        </div>
      </div>
    </div>
  )
}
