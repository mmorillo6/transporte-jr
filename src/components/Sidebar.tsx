'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logoutAction } from '@/app/actions/auth'
import type { SessionPayload } from '@/lib/session'

const navItems = [
  { href: '/mi-cuenta',      label: 'Mi cuenta',      icon: '◯', roles: ['CHOFER', 'MECANICO'] },
  { href: '/dashboard',      label: 'Dashboard',      icon: '◈', roles: ['DUENO', 'ENCARGADO', 'AFILIADO'] },
  { href: '/romana',         label: 'Romana',          icon: '⊕', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/viajes',         label: 'Viajes',          icon: '⟳', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/camiones',       label: 'Flota',            icon: '◧', roles: ['DUENO', 'ENCARGADO', 'AFILIADO'] },
  { href: '/nomina',         label: 'Nómina',          icon: '◑', roles: ['DUENO', 'ENCARGADO', 'AFILIADO'] },
  { href: '/mantenimiento',  label: 'Mantenimiento',   icon: '⚙', roles: ['DUENO', 'ENCARGADO', 'MECANICO'] },
  { href: '/despacho',       label: 'Despacho',        icon: '◈', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/caja',           label: 'Finanzas',        icon: '◎', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/relaciones',     label: 'Relaciones',      icon: '◎', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/reportes',       label: 'Reportes',        icon: '◈', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/rutas',          label: 'Minas & Rutas',   icon: '◉', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/usuarios',       label: 'Usuarios',        icon: '◫', roles: ['DUENO', 'ENCARGADO'] },
  { href: '/perfil',         label: 'Mi perfil',       icon: '◯', roles: ['DUENO', 'ENCARGADO', 'AFILIADO', 'MECANICO', 'CHOFER'] },
]

export default function Sidebar({
  session,
  collapsed = false,
  onToggle,
}: {
  session: SessionPayload
  collapsed?: boolean
  onToggle?: () => void
}) {
  const pathname = usePathname()
  const visible = navItems.filter(item => item.roles.includes(session.role))

  return (
    <aside className={`hidden lg:flex flex-col fixed inset-y-0 left-0 bg-zinc-900 border-r border-zinc-800 z-40 transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`}>

      {/* Logo / Toggle */}
      <div className={`flex items-center border-b border-zinc-800 h-16 flex-shrink-0 ${collapsed ? 'justify-center px-0' : 'gap-3 px-4'}`}>
        {collapsed ? (
          <button onClick={onToggle} title="Expandir menú" className="flex-shrink-0">
            <img src="data:image/png;base64,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" alt="Logo" style={{height:"36px",width:"auto"}} className="rounded-lg" />
          </button>
        ) : (
          <>
            <img src="/assets/logos/logo-icon-64.png" alt="Logo" width={36} height={36} className="rounded-lg flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm leading-tight">Transporte JR</p>
              <p className="text-zinc-500 text-xs">Gestión operativa</p>
            </div>
            <button onClick={onToggle} title="Colapsar menú"
              className="text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg p-1.5 transition-colors flex-shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Nav */}
      <nav className={`flex-1 py-4 space-y-0.5 overflow-y-auto ${collapsed ? 'px-2' : 'px-3'}`}>
        {visible.map(item => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center rounded-xl text-sm font-medium transition-colors ${
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
              } ${
                active
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
              {!collapsed && item.label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className={`py-4 border-t border-zinc-800 ${collapsed ? 'px-2' : 'px-3'}`}>
        {!collapsed && (
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">{session.name.charAt(0).toUpperCase()}</span>
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-medium truncate">{session.name}</p>
              <p className="text-zinc-500 text-xs capitalize">{session.role.toLowerCase()}</p>
            </div>
          </div>
        )}
        <form action={logoutAction}>
          <button
            type="submit"
            title={collapsed ? 'Cerrar sesión' : undefined}
            className={`w-full flex items-center rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors ${
              collapsed ? 'justify-center py-2.5 px-0' : 'gap-3 px-3 py-2'
            }`}
          >
            <span className="text-base w-5 text-center flex-shrink-0">→</span>
            {!collapsed && 'Cerrar sesión'}
          </button>
        </form>
      </div>
    </aside>
  )
}
