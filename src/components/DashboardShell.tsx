'use client'
import { useState, useEffect } from 'react'
import Sidebar from './Sidebar'
import MobileNav from './MobileNav'
import type { SessionPayload } from '@/lib/session'

export default function DashboardShell({
  session,
  children,
}: {
  session: SessionPayload
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)

  // Persist preference
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved === 'true') setCollapsed(true)
  }, [])

  function toggle() {
    setCollapsed(v => {
      localStorage.setItem('sidebar-collapsed', String(!v))
      return !v
    })
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      <Sidebar session={session} collapsed={collapsed} onToggle={toggle} />
      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${collapsed ? 'lg:pl-16' : 'lg:pl-64'}`}>
        <MobileNav session={session} />
        <main className="flex-1 p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
