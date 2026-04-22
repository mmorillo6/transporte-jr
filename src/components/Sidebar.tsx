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
