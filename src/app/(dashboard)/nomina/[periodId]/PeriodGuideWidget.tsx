'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

export type GuideStep = {
  label: string
  done: boolean
  detail: string
  href: string | null
  hrefLabel: string | null
  description: string
}

export default function PeriodGuideWidget({
  steps,
  periodId,
}: {
  steps: GuideStep[]
  periodId: string
}) {
  const [minimized, setMinimized] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(`guide-min-${periodId}`)
    if (stored === 'true') setMinimized(true)
  }, [periodId])

  const toggle = () =>
    setMinimized(v => {
      localStorage.setItem(`guide-min-${periodId}`, String(!v))
      return !v
    })

  const doneCount   = steps.filter(s => s.done).length
  const allDone     = doneCount === steps.length
  const nextIdx     = steps.findIndex(s => !s.done)
  const nextStep    = steps[nextIdx]

  if (allDone || !nextStep) return null

  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-40">
        <button
          onClick={toggle}
          className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-full pl-3 pr-4 py-2 shadow-xl hover:border-amber-500/60 transition-colors"
        >
          <span className="text-base leading-none">📋</span>
          <span className="text-white text-xs font-semibold">Paso {nextIdx + 1}/{steps.length}</span>
          <span className="text-zinc-500 text-xs">{doneCount} hechos</span>
        </button>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-72 shadow-2xl">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="text-base leading-none">📋</span>
            <span className="text-white font-semibold text-sm">Guía del período</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-zinc-500 text-xs">{doneCount}/{steps.length}</span>
            <button
              onClick={toggle}
              className="text-zinc-500 hover:text-white transition-colors text-lg leading-none pb-0.5"
              title="Minimizar"
            >
              −
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1 px-4 pt-3">
          {steps.map((s, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                s.done ? 'bg-emerald-500' : i === nextIdx ? 'bg-amber-500' : 'bg-zinc-700'
              }`}
            />
          ))}
        </div>

        {/* Current step */}
        <div className="px-4 py-3">
          <p className="text-zinc-500 text-[10px] uppercase tracking-widest mb-1">
            Paso {nextIdx + 1} de {steps.length}
          </p>
          <p className="text-white font-semibold text-sm mb-1">{nextStep.label}</p>
          <p className="text-zinc-400 text-xs leading-relaxed">{nextStep.description}</p>
        </div>

        {/* Action */}
        {nextStep.href && (
          <div className="px-4 pb-4">
            <Link
              href={nextStep.href}
              className="block w-full text-center bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-xl py-2 text-sm transition-colors"
            >
              {nextStep.hrefLabel ?? 'Ir ahora →'}
            </Link>
          </div>
        )}
        {!nextStep.href && (
          <p className="text-zinc-600 text-xs text-center pb-4">Completa este paso en la página</p>
        )}
      </div>
    </div>
  )
}
