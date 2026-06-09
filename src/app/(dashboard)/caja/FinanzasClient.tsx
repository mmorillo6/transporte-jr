'use client'
import { useRouter } from 'next/navigation'
import CajaClient from './CajaClient'
import GastosClient from '../gastos/GastosClient'
import PrestamosClient from '../prestamos/PrestamosClient'
import CuentasPorCobrarClient from '../cuentas-por-cobrar/CuentasPorCobrarClient'

type Tab = 'caja' | 'gastos' | 'prestamos' | 'cobrar'

const TABS: { id: Tab; label: string; desc: string }[] = [
  { id: 'caja',      label: 'Caja',        desc: 'Efectivo & USDT' },
  { id: 'gastos',    label: 'Gastos',       desc: 'Egresos operativos' },
  { id: 'prestamos', label: 'Préstamos',    desc: 'Adelantos a choferes' },
  { id: 'cobrar',    label: 'Por cobrar',   desc: 'Deudas de clientes' },
]

export default function FinanzasClient({
  tab,
  // caja
  cashEntries, balanceEfectivo, balanceUsdt,
  // gastos
  expenses, trucks, gastosParams, categoryLabels, totalExpPaid, totalExpOwed,
  // prestamos
  loans, drivers, totalLoaned, totalPending, totalPaidLoans,
  // por cobrar
  cuentas, totalPorCobrar,
  // socioLoans
  socioLoans, totalSocioDebt,
}: {
  tab: string
  cashEntries: any[]
  balanceEfectivo: number
  balanceUsdt: number
  expenses: any[]
  trucks: { id: string; plate: string; driver: { name: string } | null }[]
  gastosParams: Record<string, string | undefined>
  categoryLabels: Record<string, string>
  totalExpPaid: number
  totalExpOwed: number
  loans: any[]
  drivers: { id: string; name: string }[]
  totalLoaned: number
  totalPending: number
  totalPaidLoans: number
  cuentas: any[]
  totalPorCobrar: number
  socioLoans: any[]
  totalSocioDebt: number
}) {
  const router = useRouter()
  const activeTab = (TABS.find(t => t.id === tab) ? tab : 'caja') as Tab

  return (
    <div className="space-y-4">
      {/* ── KPI strip ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs mb-1">Efectivo en mano</p>
          <p className={`text-2xl font-bold ${balanceEfectivo >= 0 ? 'text-white' : 'text-red-400'}`}>
            ${Math.abs(balanceEfectivo).toFixed(2)}
          </p>
          <p className="text-zinc-600 text-xs mt-1">USD billete</p>
        </div>
        <div className="bg-zinc-900 border border-amber-500/20 rounded-2xl p-4">
          <p className="text-zinc-500 text-xs mb-1">USDT en wallet</p>
          <p className={`text-2xl font-bold ${balanceUsdt >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
            ${Math.abs(balanceUsdt).toFixed(2)}
          </p>
          <p className="text-zinc-600 text-xs mt-1">Tether / Binance</p>
        </div>
        <div className={`rounded-2xl p-4 border ${totalExpOwed > 0 ? 'bg-red-500/5 border-red-500/20' : 'bg-zinc-900 border-zinc-800'}`}>
          <p className="text-zinc-500 text-xs mb-1">Gastos por pagar</p>
          <p className={`text-2xl font-bold ${totalExpOwed > 0 ? 'text-red-400' : 'text-zinc-400'}`}>
            ${totalExpOwed.toFixed(2)}
          </p>
          <p className="text-zinc-600 text-xs mt-1">{expenses.filter((e: any) => e.isCredit).length} fiados</p>
        </div>
        <div className={`rounded-2xl p-4 border ${totalPending > 0 ? 'bg-orange-500/5 border-orange-500/20' : 'bg-zinc-900 border-zinc-800'}`}>
          <p className="text-zinc-500 text-xs mb-1">Préstamos pendientes</p>
          <p className={`text-2xl font-bold ${totalPending > 0 ? 'text-orange-400' : 'text-zinc-400'}`}>
            ${totalPending.toFixed(2)}
          </p>
          <p className="text-zinc-600 text-xs mt-1">{loans.filter((l: any) => l.balance > 0).length} activos</p>
        </div>
        <div className={`rounded-2xl p-4 border ${totalPorCobrar > 0 ? 'bg-blue-500/5 border-blue-500/20' : 'bg-zinc-900 border-zinc-800'}`}>
          <p className="text-zinc-500 text-xs mb-1">Por cobrar</p>
          <p className={`text-2xl font-bold ${totalPorCobrar > 0 ? 'text-blue-400' : 'text-zinc-400'}`}>
            ${totalPorCobrar.toFixed(2)}
          </p>
          <p className="text-zinc-600 text-xs mt-1">{cuentas.filter((c: any) => c.status !== 'PAID').length} pendientes</p>
        </div>
        <div className={`rounded-2xl p-4 border ${totalSocioDebt > 0 ? 'bg-purple-500/5 border-purple-500/20' : 'bg-zinc-900 border-zinc-800'}`}>
          <p className="text-zinc-500 text-xs mb-1">Deudas a socios</p>
          <p className={`text-2xl font-bold ${totalSocioDebt > 0 ? 'text-purple-400' : 'text-zinc-400'}`}>
            ${totalSocioDebt.toFixed(2)}
          </p>
          <p className="text-zinc-600 text-xs mt-1">{socioLoans.filter((l: any) => l.status === 'PENDIENTE').length} pendientes</p>
        </div>
      </div>

      {/* ── Tab selector ──────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-2xl p-1.5">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => router.push(`/caja?tab=${t.id}`)}
            className={`flex-1 rounded-xl py-2.5 px-3 text-sm font-medium transition-colors text-left ${
              activeTab === t.id
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            <span className="block font-semibold">{t.label}</span>
            <span className="block text-xs opacity-60 mt-0.5">{t.desc}</span>
          </button>
        ))}
      </div>

      {/* ── Tab content ───────────────────────────────────────────────────── */}
      {activeTab === 'caja' && (
        <CajaClient
          entries={cashEntries}
          balanceEfectivo={balanceEfectivo}
          balanceUsdt={balanceUsdt}
          hideSaldoCards
          socioLoans={socioLoans}
        />
      )}

      {activeTab === 'gastos' && (
        <>
          {/* Gastos KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <p className="text-zinc-500 text-xs">Total abonado</p>
              <p className="text-white font-bold text-xl mt-1">${totalExpPaid.toFixed(2)}</p>
            </div>
            <div className="bg-zinc-900 border border-red-500/20 rounded-xl p-3">
              <p className="text-red-400 text-xs">Por pagar</p>
              <p className="text-red-400 font-bold text-xl mt-1">${totalExpOwed.toFixed(2)}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <p className="text-zinc-500 text-xs">Total registros</p>
              <p className="text-white font-bold text-xl mt-1">{expenses.length}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <p className="text-zinc-500 text-xs">Pendientes / parciales</p>
              <p className="text-amber-400 font-bold text-xl mt-1">{expenses.filter((e: any) => e.isCredit).length}</p>
            </div>
          </div>
          <GastosClient
            expenses={expenses}
            trucks={trucks}
            params={gastosParams}
            categoryLabels={categoryLabels}
            filterBase="/caja?tab=gastos"
          />
        </>
      )}

      {activeTab === 'prestamos' && (
        <>
          {/* Préstamos KPIs */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <p className="text-zinc-500 text-xs">Total prestado</p>
              <p className="text-white font-bold text-xl mt-1">${totalLoaned.toFixed(2)}</p>
            </div>
            <div className="bg-zinc-900 border border-amber-500/20 rounded-xl p-3">
              <p className="text-amber-400 text-xs">Saldo pendiente</p>
              <p className="text-amber-400 font-bold text-xl mt-1">${totalPending.toFixed(2)}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <p className="text-zinc-500 text-xs">Saldados</p>
              <p className="text-emerald-400 font-bold text-xl mt-1">{totalPaidLoans}</p>
            </div>
          </div>
          <PrestamosClient loans={loans} drivers={drivers} />
        </>
      )}

      {activeTab === 'cobrar' && (
        <CuentasPorCobrarClient cuentas={cuentas} />
      )}
    </div>
  )
}
