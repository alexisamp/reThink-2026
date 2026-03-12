import React from 'react'
import { House } from '@phosphor-icons/react'

interface StepField {
  key: string
  placeholder?: string
  type?: 'text' | 'textarea'
  label?: string
}

interface StepSection {
  prompt: string
  fields: StepField[]
}

interface StepLayoutProps {
  step: number
  totalSteps: number
  progress: number
  tagline: string
  title: string
  subtitle: string
  // Body options — provide one of: children, sections, or prompt+fields
  children?: React.ReactNode
  sections?: StepSection[]
  prompt?: string
  fields?: StepField[]
  // Required when using prompt/fields/sections (not needed with children)
  values?: Record<string, string>
  onChange?: (key: string, value: string) => void
  onNext: () => void
  onBack?: () => void
  saving?: boolean
  isLastStep?: boolean
}

export default function StepLayout({
  step, totalSteps, progress, tagline, title, subtitle,
  children, sections, prompt, fields, values = {}, onChange,
  onNext, onBack, saving, isLastStep,
}: StepLayoutProps) {

  const renderField = (field: StepField, i: number) => (
    <div
      key={field.key}
      className="group relative border-b border-mercury pb-1 flex items-baseline gap-4 transition-all duration-200 focus-within:border-black focus-within:border-b-[1.5px]"
    >
      {field.label ? (
        <span className="text-[11px] text-shuttle uppercase tracking-wider font-medium flex-shrink-0 min-w-[100px]">
          {field.label}
        </span>
      ) : (
        <span className="text-mercury font-mono text-xs group-focus-within:text-pastel transition-colors flex-shrink-0">
          {i + 1}
        </span>
      )}
      {field.type === 'textarea' ? (
        <textarea
          className="w-full text-base text-burnham bg-transparent border-none p-0 focus:ring-0 placeholder-mercury font-normal resize-none min-h-[64px]"
          placeholder={field.placeholder ?? 'Write here...'}
          value={values[field.key] ?? ''}
          onChange={e => onChange?.(field.key, e.target.value)}
          autoFocus={i === 0}
          rows={3}
        />
      ) : (
        <input
          type="text"
          autoFocus={i === 0}
          className="peer w-full text-base text-burnham bg-transparent border-none p-0 focus:ring-0 placeholder-mercury font-normal"
          placeholder={field.placeholder ?? 'Write here...'}
          value={values[field.key] ?? ''}
          onChange={e => onChange?.(field.key, e.target.value)}
        />
      )}
      <div
        className={`absolute right-0 bottom-3 w-1.5 h-1.5 rounded-full bg-gossip transition-all duration-300 ${
          values[field.key] ? 'opacity-100 scale-100' : 'opacity-0 scale-0'
        }`}
      />
    </div>
  )

  return (
    <div className="min-h-screen bg-white text-burnham font-sans">
      <main className="w-full max-w-2xl mx-auto px-8 pt-12 md:pt-20 pb-12 flex flex-col min-h-screen">

        {/* Header */}
        <header className="mb-12">
          <div className="flex justify-between items-center text-xs font-medium mb-4">
            <div className="flex items-center gap-2 text-shuttle">
              <House size={14} />
              <span>/</span>
              <span>Annual Review 2026</span>
            </div>
            <span className="text-mercury font-mono text-[10px]">{step} / {totalSteps}</span>
          </div>
          <div className="h-px w-full bg-mercury relative">
            <div
              className="absolute left-0 top-0 h-full bg-pastel transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </header>

        {/* Content */}
        <div className="flex-1">
          <div className="mb-10">
            <span className="text-[10px] uppercase tracking-[0.1em] text-shuttle block mb-4 font-medium">
              {tagline}
            </span>
            <h1 className="text-2xl md:text-3xl font-semibold text-burnham tracking-[-0.02em] mb-3">
              {title}
            </h1>
            <p className="text-shuttle italic font-serif text-sm">{subtitle}</p>
          </div>

          {children ? (
            children
          ) : sections ? (
            <div className="space-y-10">
              {sections.map((section, si) => (
                <div key={si}>
                  <h2 className="text-base font-bold text-burnham mb-5">{section.prompt}</h2>
                  <div className="space-y-6">
                    {section.fields.map((f, fi) => renderField(f, fi))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h2 className="text-lg font-bold text-burnham">{prompt}</h2>
              </div>
              <form className="space-y-6" onSubmit={e => { e.preventDefault(); onNext() }}>
                {fields?.map((f, fi) => renderField(f, fi))}
              </form>
            </>
          )}
        </div>

        {/* Footer */}
        <footer className="mt-16 pt-6 flex justify-between items-center">
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-shuttle hover:text-burnham transition-colors font-medium"
            disabled={!onBack}
            style={{ opacity: onBack ? 1 : 0, pointerEvents: onBack ? 'auto' : 'none' }}
          >
            Back
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={saving}
            className="text-sm font-bold text-burnham flex items-center gap-2 hover:opacity-80 transition-opacity disabled:opacity-50"
          >
            {saving ? 'Saving...' : isLastStep ? 'Finish' : 'Next'}
            {!saving && <span className="text-pastel text-lg leading-none">→</span>}
          </button>
        </footer>
      </main>
    </div>
  )
}
