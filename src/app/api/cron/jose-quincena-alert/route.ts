import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendWhatsAppRaw } from '@/lib/notifications'
import { buildOperationalAlertsMessage } from '@/lib/operationalAlerts'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Venezuela is UTC-4 — compute today's date in VE timezone
  const now = new Date()
  const veNow = new Date(now.getTime() - 4 * 60 * 60 * 1000)
  const [veYear, veMonth, veDay] = veNow.toISOString().split('T')[0].split('-').map(Number)
  const todayMid = new Date(Date.UTC(veYear, veMonth - 1, veDay))

  const result: Record<string, unknown> = {}

  // ── 1. Quincena sin cerrar (solo a José) ────────────────────────────────────
  // Avisa el día 16 y luego cada 3 días (19, 22, 25...) mientras siga sin cerrarse
  const daysSince16 = veDay - 16
  if (daysSince16 >= 0 && daysSince16 % 3 === 0) {
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

    if (period?.status !== 'CLOSED') {
      const jose = await prisma.user.findFirst({
        where: { role: 'DUENO', active: true },
        select: { name: true, phone: true, whatsappApiKey: true },
      })
      if (jose?.phone && jose.whatsappApiKey) {
        const diasTranscurridos = veDay - 15
        const text = `📋 *Transporte JR*\nLa quincena del 1 al 15 aún no ha sido cerrada en el sistema. Han pasado ${diasTranscurridos} día${diasTranscurridos === 1 ? '' : 's'} desde que finalizó.`
        try {
          await sendWhatsAppRaw(jose.phone, jose.whatsappApiKey, text)
          result.quincena = { sent: true, to: jose.name }
        } catch (e) {
          result.quincena = { error: (e as Error).message }
        }
      } else {
        result.quincena = { error: 'José phone or apiKey not configured' }
      }
    } else {
      result.quincena = { skipped: true, reason: 'period already closed' }
    }
  } else {
    result.quincena = { skipped: true, reason: 'not an alert day' }
  }

  // ── 2. Alertas operativas (CxC vencida, mantenimiento, cauchos, préstamos, caja) ──
  // Se envían tanto a José como a Fernando (cualquier DUEÑO/ENCARGADO activo con WhatsApp configurado)
  const opsMessage = await buildOperationalAlertsMessage(todayMid, veDay)
  if (opsMessage) {
    const recipients = await prisma.user.findMany({
      where: { role: { in: ['DUENO', 'ENCARGADO'] }, active: true, phone: { not: null }, whatsappApiKey: { not: null } },
      select: { name: true, phone: true, whatsappApiKey: true },
    })
    const sent: string[] = []
    const failed: string[] = []
    for (const r of recipients) {
      try {
        await sendWhatsAppRaw(r.phone!, r.whatsappApiKey!, opsMessage)
        sent.push(r.name)
      } catch (e) {
        console.error(`CallMeBot error for ${r.name}:`, (e as Error).message)
        failed.push(r.name)
      }
    }
    result.operational = { sent, failed }
  } else {
    result.operational = { skipped: true, reason: 'nothing to report' }
  }

  return NextResponse.json(result)
}
