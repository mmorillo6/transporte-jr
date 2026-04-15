'use client'
import { useState, useEffect } from 'react'
import { createTrip } from '@/app/actions/trips'
import Link from 'next/link'

type Truck = {
  id: string
  plate: string
  driver: { name: string } | null
  owner: { name: string }
}

type Route = {
  id: string
  name: string
  rateType: string
  rate: number
  hasViatico: boolean
  viaticoSingle: number
  viaticoDouble: number
}

export default function TripForm({ trucks, routes }: { trucks: Truck[]; routes: Route[] }) {
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null)
  const [netWeightKg, setNetWeightKg] = useState('')
  const [hours, setHours] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const calculatedAmount = selectedRoute
    ? selectedRoute.rateType === 'PER_TON'
      ? ((parseFloat(netWeightKg) || 0) / 1000) * selectedRoute.rate
      : selectedRoute.rateType === 'PER_HOUR'
      ? (parseFloat(hours) || 0) * selectedRoute.rate
      : selectedRoute.rate
    : 0

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const formData = new FormData(e.currentTarget)
    const result = await createTrip(formData)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
      {/* Fecha y Ticket */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Fecha *</label>
          <input
            name="date"
            type="date"
            required
            defaultValue={new Date().toISOString().split('T')[0]}
            className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">N° Ticket</label>
          <input
            name="ticketNo"
            type="text"
            placeholder="35540"
            className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 placeholder:text-zinc-600"
          />
        </div>
      </div>

      {/* Camión */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">Camión *</label>
        <select
          name="truckId"
          required
          className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
        >
          <option value="">Seleccionar camión...</option>
          {trucks.map(t => (
            <option key={t.id} value={t.id}>
              {t.plate} — {t.driver?.name ?? 'Sin chofer'} ({t.owner.name})
            </option>
          ))}
        </select>
      </div>

      {/* Ruta */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">Ruta / Mina *</label>
        <select
          name="routeId"
          required
          onChange={e => {
            const r = routes.find(r => r.id === e.target.value) ?? null
            setSelectedRoute(r)
          }}
          className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
        >
          <option value="">Seleccionar ruta...</option>
          {routes.map(r => (
            <option key={r.id} value={r.id}>
              {r.name} — {r.rateType === 'PER_TON' ? `$${r.rate}/ton` : r.rateType === 'PER_HOUR' ? `$${r.rate}/h` : `$${r.rate}/viaje`}
            </option>
          ))}
        </select>
        {selectedRoute && (
          <p className="text-zinc-500 text-xs mt-1.5">
            Tarifa: <span className="text-amber-400 font-medium">
              {selectedRoute.rateType === 'PER_TON' ? `$${selectedRoute.rate} por tonelada` : selectedRoute.rateType === 'PER_HOUR' ? `$${selectedRoute.rate} por hora` : `$${selectedRoute.rate} por viaje`}
            </span>
            {selectedRoute.hasViatico && (
              <span className="ml-2 text-blue-400">
                · Viático: ${selectedRoute.viaticoSingle} (2 viajes: ${selectedRoute.viaticoDouble})
              </span>
            )}
          </p>
        )}
      </div>

      {/* Peso neto (PER_TON) o Horas (PER_HOUR) */}
      {(!selectedRoute || selectedRoute.rateType === 'PER_TON') && (
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">
            Peso neto (kg){selectedRoute?.rateType === 'PER_TON' && ' *'}
          </label>
          <input
            name="netWeightKg"
            type="number"
            step="0.01"
            min="0"
            value={netWeightKg}
            onChange={e => setNetWeightKg(e.target.value)}
            required={selectedRoute?.rateType === 'PER_TON'}
            placeholder="25840"
            className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 placeholder:text-zinc-600"
          />
          {netWeightKg && (
            <p className="text-zinc-500 text-xs mt-1">
              = <span className="text-white font-medium">{(parseFloat(netWeightKg) / 1000).toFixed(3)} ton</span>
            </p>
          )}
        </div>
      )}
      {selectedRoute?.rateType === 'PER_HOUR' && (
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Horas trabajadas *</label>
          <input
            name="hours"
            type="number"
            step="0.5"
            min="0.5"
            value={hours}
            onChange={e => setHours(e.target.value)}
            required
            placeholder="8"
            className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 placeholder:text-zinc-600"
          />
        </div>
      )}

      {/* Material y Origen */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Tipo de material *</label>
          <select
            name="material"
            required
            className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
          >
            <option value="">Seleccionar...</option>
            <option value="ARENA">ARENA</option>
            <option value="PRIMARIO">PRIMARIO</option>
            <option value="CALIZA">CALIZA</option>
            <option value="GRANZA">GRANZA</option>
            <option value="BALASTO">BALASTO</option>
            <option value="ARCILLA">ARCILLA</option>
            <option value="OTRO">OTRO</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Origen (mina / sector)</label>
          <input
            name="origin"
            type="text"
            placeholder="LA FE, NUEVO CALLAO..."
            className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 placeholder:text-zinc-600"
          />
        </div>
      </div>

      {/* Notas */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">Notas</label>
        <textarea
          name="notes"
          rows={2}
          placeholder="Observaciones opcionales..."
          className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 placeholder:text-zinc-600 resize-none"
        />
      </div>

      {/* Preview del monto */}
      {selectedRoute && (
        <div className="bg-zinc-900 border border-amber-500/20 rounded-xl p-4">
          <p className="text-zinc-400 text-xs mb-1">Monto calculado</p>
          <p className="text-amber-400 text-3xl font-bold">${calculatedAmount.toFixed(2)}</p>
          {selectedRoute.rateType === 'PER_TON' && (
            <p className="text-zinc-500 text-xs mt-1">
              {(parseFloat(netWeightKg) / 1000 || 0).toFixed(3)} ton × ${selectedRoute.rate}/ton
            </p>
          )}
          {selectedRoute.rateType === 'PER_HOUR' && (
            <p className="text-zinc-500 text-xs mt-1">
              {parseFloat(hours) || 0} h × ${selectedRoute.rate}/h
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl px-4 py-3 text-sm transition-colors"
        >
          {loading ? 'Guardando...' : 'Registrar viaje'}
        </button>
        <Link
          href="/viajes"
          className="px-4 py-3 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl text-sm font-medium transition-colors"
        >
          Cancelar
        </Link>
      </div>
    </form>
  )
}
