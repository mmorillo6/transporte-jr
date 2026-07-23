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
  const [veYear, veMonth, veDay] = veNow.toISOString().split('T')[0].split('-').map(Number)

  if (veDay !== 16 && veDay !== 17) {
    return NextResponse.json({ skipped: true, reason: 'not day 16 or 17' })
  }

  // Primera quincena del mes en curso: del 1 al 15
  const monthStart    = new Date(Date.UTC(veYear, veMonth - 1, 1, 0, 0, 0))
  const monthStartEnd = new Date(Date.UTC(veYear, veMonth - 1, 1, 23, 59, 59, 999))
  const day15Start    = new Date(Date.UTC(veYear, veMonth - 1, 15, 0, 0, 0))
  const day15End      = new Date(Date.UTC(veYear, veMonth - 1, 15, 23, 59, 59, 999))

  const period = await prisma.period.findFirst({
    where: {
      startDate: { gte: monthStart, lte: monthStartEnd },
      endDate:   { gte: day15Start, lte: day15End },
    },
    orderBy: { startDate: 'desc' },
    select: { id: true, status: true },
  })

  if (period?.status === 'CLOSED') {
    return NextResponse.json({ skipped: true, reason: 'period already closed' })
  }

  const jose = await prisma.user.findFirst({
    where: { role: 'DUENO', active: true },
    select: { name: true, phone: true, whatsappApiKey: true },
  })

  if (!jose?.phone || !jose.whatsappApiKey) {
    return NextResponse.json({ error: 'José phone or apiKey not configured' }, { status: 500 })
  }

  const text = encodeURIComponent(
    `⚠️ *Transporte JR*\nFernando aún no ha cerrado la quincena del 1 al 15. Ya estamos a día ${veDay}.`
  )
  const digits = jose.phone.replace(/\D/g, '')
  const url = `https://api.callmebot.com/whatsapp.php?phone=${digits}&text=${text}&apikey=${jose.whatsappApiKey}`

  const res = await fetch(url)
  if (!res.ok) {
    console.error(`CallMeBot error: ${res.status}`)
    return NextResponse.json({ error: `CallMeBot ${res.status}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, sent: true, to: jose.name })
}
