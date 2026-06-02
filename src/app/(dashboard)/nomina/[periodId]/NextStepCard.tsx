type Variant = 'amber' | 'blue' | 'emerald' | 'purple'

type Step = {
  num: number | '✓'
  label: string
  description: string
  href?: string
  hrefLabel?: string
  variant: Variant
}

const COLORS: Record<Variant, { border: string; bg: string; icon: string; text: string; sub: string; btn: string }> = {
  amber:   { border: 'border-amber-500/30',   bg: 'bg-amber-500/5',   icon: 'bg-amber-500',   text: 'text-amber-300',   sub: 'text-amber-400/70',   btn: 'bg-amber-500 hover:bg-amber-400 text-zinc-950' },
  blue:    { border: 'border-blue-500/30',    bg: 'bg-blue-500/5',    icon: 'bg-blue-500',    text: 'text-blue-300',    sub: 'text-blue-400/70',    btn: 'bg-blue-500 hover:bg-blue-400 text-white' },
  emerald: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', icon: 'bg-emerald-500', text: 'text-emerald-300', sub: 'text-emerald-400/70', btn: 'bg-emerald-500 hover:bg-emerald-400 text-white' },
  purple:  { border: 'border-purple-500/30',  bg: 'bg-purple-500/5',  icon: 'bg-purple-500',  text: 'text-purple-300',  sub: 'text-purple-400/70',  btn: 'bg-purple-500 hover:bg-purple-400 text-white' },
}

export default function NextStepCard({ step }: { step: Step }) {
  const c = COLORS[step.variant]
  return (
    <div className={`${c.bg} border ${c.border} rounded-2xl px-5 py-4 flex items-start gap-4`}>
      <div className={`${c.icon} rounded-full w-7 h-7 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5`}>
        {step.num}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`${c.text} font-semibold text-sm`}>
          {step.variant === 'emerald' ? '' : 'Siguiente paso — '}{step.label}
        </p>
        <p className={`${c.sub} text-xs mt-0.5 leading-relaxed`}>{step.description}</p>
      </div>
      {step.href && (
        <a
          href={step.href}
          className={`${c.btn} font-semibold rounded-xl px-4 py-2 text-xs flex-shrink-0 transition-colors whitespace-nowrap`}
        >
          {step.hrefLabel ?? 'Ir →'}
        </a>
      )}
    </div>
  )
}
