'use client'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  ResponsiveContainer, CartesianGrid, LabelList,
} from 'recharts'

type PeriodData = { month: string; revenue: number; net: number; trips: number }
type RouteData  = { name: string; tons: number }

function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-zinc-400 mb-1.5 font-medium">Período {label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center justify-between gap-4" style={{ color: p.fill }}>
          <span>{p.name}</span>
          <span className="font-bold">${p.value.toLocaleString('es-VE', { minimumFractionDigits: 0 })}</span>
        </p>
      ))}
      {payload.length === 2 && (
        <p className="text-zinc-500 mt-1.5 pt-1.5 border-t border-zinc-700">
          Empresa: ${(payload[0].value - payload[1].value).toLocaleString('es-VE', { minimumFractionDigits: 0 })}
        </p>
      )}
    </div>
  )
}

function RouteTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-zinc-400 mb-1 font-medium">{label}</p>
      <p className="text-emerald-400 font-bold">{payload[0]?.value.toFixed(2)} ton</p>
    </div>
  )
}

function shortDollar(value: number) {
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`
  return `$${value.toFixed(0)}`
}

export default function DashboardCharts({
  data,
  showFinancials,
  routeData,
  mode = 'periods',
}: {
  data: PeriodData[]
  showFinancials: boolean
  routeData?: RouteData[]
  mode?: 'periods' | 'routes'
}) {
  if (mode === 'routes' && routeData) {
    return (
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={routeData} margin={{ top: 20, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#27272a" />
          <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} unit=" t" />
          <Tooltip content={<RouteTip />} cursor={{ fill: '#27272a' }} />
          <Bar dataKey="tons" name="Toneladas" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={48}>
            <LabelList dataKey="tons" position="top" formatter={((v: unknown) => typeof v === 'number' ? `${v.toFixed(1)}t` : '') as any}
              style={{ fill: '#71717a', fontSize: 9 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    )
  }

  // Si solo hay 1 período, mostrar barras más anchas
  const barSize = data.length <= 2 ? 48 : 28

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} barGap={2} barCategoryGap={data.length <= 2 ? '60%' : '30%'}
        margin={{ top: 24, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#27272a" />
        <XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip content={<Tip />} cursor={{ fill: '#27272a' }} />
        {showFinancials && (
          <Bar dataKey="revenue" name="Facturado" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={barSize}>
            <LabelList dataKey="revenue" position="top" formatter={shortDollar as any}
              style={{ fill: '#a16207', fontSize: 9, fontWeight: 'bold' }} />
          </Bar>
        )}
        {showFinancials && (
          <Bar dataKey="net" name="Neto propietarios" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={barSize}>
            <LabelList dataKey="net" position="top" formatter={shortDollar as any}
              style={{ fill: '#6d28d9', fontSize: 9, fontWeight: 'bold' }} />
          </Bar>
        )}
      </BarChart>
    </ResponsiveContainer>
  )
}
