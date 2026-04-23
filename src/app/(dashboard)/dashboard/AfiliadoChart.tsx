'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface ChartData {
  label: string
  bruto: number
  neto: number
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs">
      <p className="text-zinc-400 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {p.name}: ${p.value.toFixed(0)}
        </p>
      ))}
    </div>
  )
}

export default function AfiliadoChart({ data }: { data: ChartData[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} barGap={4} barCategoryGap="30%">
        <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} width={55} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Legend formatter={(v) => <span className="text-xs text-zinc-400">{v}</span>} />
        <Bar dataKey="bruto" name="Bruto" fill="#f59e0b" radius={[4, 4, 0, 0]} />
        <Bar dataKey="neto"  name="Neto"  fill="#10b981" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
