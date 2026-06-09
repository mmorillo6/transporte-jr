import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Venezuela is UTC-4 — compute today's date in VE timezone
  const now = new Date()
  const veNow = new Date(now.getTime() - 4 * 60 * 60 * 1000)
  const veToday = veNow.toISOString().split('T')[0]

  // Dispatches are stored at midnight VE = T04:00:00Z UTC
  const todayStart = new Date(`${veToday}T04:00:00Z`)
  const todayEnd   = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

  const todayDispatch = await prisma.dispatch.findFirst({
    where: { date: { gte: todayStart, lt: todayEnd } },
    select: { id: true },
  })

  if (todayDispatch) {
    return NextResponse.json({ skipped: true, reason: 'dispatch already registered for today' })
  }

  const fernando = await prisma.user.findFirst({
    where: { role: 'ENCARGADO', active: true },
    select: { name: true, phone: true, whatsappApiKey: true },
  })

  if (!fernando?.phone || !fernando.whatsappApiKey) {
    return NextResponse.json({ error: 'Fernando phone or apiKey not configured' }, { status: 500 })
  }

  const text = encodeURIComponent(
    `⏰ *Transporte JR*\nRecuerda registrar el despacho de hoy en la app antes de que salgan los camiones.`
  )
  const digits = fernando.phone.replace(/\D/g, '')
  const url = `https://api.callmebot.com/whatsapp.php?phone=${digits}&text=${text}&apikey=${fernando.whatsappApiKey}`

  const res = await fetch(url)
  if (!res.ok) {
    console.error(`CallMeBot error: ${res.status}`)
    return NextResponse.json({ error: `CallMeBot ${res.status}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, sent: true, to: fernando.name })
}
