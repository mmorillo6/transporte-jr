'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logoutAction } from '@/app/actions/auth'
import type { SessionPayload } from '@/lib/session'

const navItems = [
  { href: '/mi-cuenta',     label: 'Mi cuenta',    icon: '◯', roles: ['CHOFER', 'MECANICO'] },
  { href: '/dashboard',     label: 'Dashboard',    icon: '◈', roles: ['DUENO', 'ENCARGADO', 'AFILIADO'] },
  { href: '/romana',        label: 'Romana',        icon: '⊕', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/viajes',        label: 'Viajes',        icon: '⟳', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/camiones',      label: 'Flota',          icon: '◧', roles: ['DUENO', 'ENCARGADO', 'AFILIADO'] },
  { href: '/nomina',        label: 'Nómina',        icon: '◑', roles: ['DUENO', 'ENCARGADO', 'AFILIADO'] },
  { href: '/mantenimiento', label: 'Mantenim.',     icon: '⚙', roles: ['DUENO', 'ENCARGADO', 'MECANICO'] },
  { href: '/despacho',      label: 'Despacho',      icon: '◈', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/dias-internos', label: 'Días Internos', icon: '⏱', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/caja',          label: 'Finanzas',      icon: '◎', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/almacen',       label: 'Almacén',       icon: '▣', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/relaciones',    label: 'Relaciones',    icon: '◎', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/analisis',      label: 'Análisis',      icon: '◎', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/reportes',      label: 'Reportes',      icon: '◈', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/rutas',         label: 'Minas',         icon: '◉', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/usuarios',      label: 'Usuarios',      icon: '◫', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/perfil',        label: 'Mi perfil',     icon: '◯', roles: ['DUENO', 'ENCARGADO', 'AFILIADO', 'MECANICO', 'CHOFER'] },
]

export default function MobileNav({ session }: { session: SessionPayload }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const visible = navItems.filter(item => item.roles.includes(session.role))

  return (
    <>
      {/* Top bar */}
      <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800 sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <img src="data:image/png;base64,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" alt="Logo" style={{height:"32px",width:"auto"}} className="rounded-lg" />
          <span className="text-white font-semibold text-sm">Transporte JR</span>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="p-2 text-zinc-400 hover:text-white transition-colors"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>

      {/* Drawer overlay */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="relative w-72 bg-zinc-900 flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <img src="data:image/png;base64,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" alt="Logo" style={{height:"32px",width:"auto"}} className="rounded-lg" />
                <span className="text-white font-semibold text-sm">Transporte JR</span>
              </div>
              <button onClick={() => setOpen(false)} className="text-zinc-400 hover:text-white p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
              {visible.map(item => {
                const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors ${
                      active
                        ? 'bg-amber-500/10 text-amber-400'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    <span className="text-base w-5 text-center">{item.icon}</span>
                    {item.label}
                  </Link>
                )
              })}
            </nav>

            {/* User */}
            <div className="px-3 py-4 border-t border-zinc-800">
              <div className="flex items-center gap-3 px-3 py-2 mb-2">
                <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center">
                  <span className="text-white text-sm font-bold">{session.name.charAt(0).toUpperCase()}</span>
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{session.name}</p>
                  <p className="text-zinc-500 text-xs capitalize">{session.role.toLowerCase()}</p>
                </div>
              </div>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  <span className="w-5 text-center">→</span>
                  Cerrar sesión
                </button>
              </form>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
