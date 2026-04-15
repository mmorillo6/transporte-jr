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
  { href: '/caja',          label: 'Finanzas',      icon: '◎', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/relaciones',    label: 'Relaciones',    icon: '◎', roles: ['DUENO', 'ENCARGADO'] },
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
          <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-zinc-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 17h8M3 17l1.5-7h15L21 17M5 10V7a2 2 0 012-2h10a2 2 0 012 2v3" />
            </svg>
          </div>
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
                <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-zinc-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 17h8M3 17l1.5-7h15L21 17M5 10V7a2 2 0 012-2h10a2 2 0 012 2v3" />
                  </svg>
                </div>
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
