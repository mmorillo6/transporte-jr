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
          <button onClick={onToggle} title="Expandir menú"
            className="w-9 h-9 bg-amber-500 rounded-xl flex items-center justify-center hover:bg-amber-400 transition-colors flex-shrink-0">
            <svg className="w-4 h-4 text-zinc-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
          <>
            <svg className="w-9 h-9 flex-shrink-0" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
              <rect x="0" y="0" width="256" height="256" rx="54" fill="#F59E0B"/>
              <g transform="translate(32, 70)">
                <path d="M 14 100 L 14 44 Q 66 10 136 28 L 172 100 Z" fill="#FFFBEB"/>
                <path d="M 172 100 L 172 48 L 214 48 L 232 78 L 232 100 Z" fill="#FFFBEB"/>
                <rect x="180" y="56" width="26" height="14" rx="2" fill="#F59E0B"/>
                <circle cx="52" cy="118" r="14" fill="#F59E0B" stroke="#FFFBEB" strokeWidth="6"/>
                <circle cx="196" cy="118" r="14" fill="#F59E0B" stroke="#FFFBEB" strokeWidth="6"/>
                <line x1="-8" y1="134" x2="248" y2="134" stroke="#FFFBEB" strokeWidth="5" strokeLinecap="round"/>
                <circle cx="58" cy="32" r="4.5" fill="#FCD34D"/>
                <circle cx="84" cy="20" r="5.5" fill="#FDE68A"/>
                <circle cx="108" cy="27" r="4.5" fill="#FCD34D"/>
                <circle cx="128" cy="21" r="4.5" fill="#FDE68A"/>
              </g>
            </svg>
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
