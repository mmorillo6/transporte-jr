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

  // ── 2. Segunda quincena sin cerrar (16 al fin del mes anterior, solo a José) ──
  // El período 16-fin siempre termina el último día de SU mes, así que se compara
  // contra "el mes anterior al de hoy" — esto funciona sin importar el día del mes
  // en que estemos, incluso si sigue sin cerrarse muchos días después de terminar.
  {
    const prevMonthDate = new Date(Date.UTC(veYear, veMonth - 2, 1))
    const prevYear  = prevMonthDate.getUTCFullYear()
    const prevMonth = prevMonthDate.getUTCMonth() // 0-indexed
    const prevMonthLastDay = new Date(Date.UTC(prevYear, prevMonth + 1, 0)).getUTCDate()

    const secondQStart    = new Date(Date.UTC(prevYear, prevMonth, 16, 0, 0, 0))
    const secondQStartEnd = new Date(Date.UTC(prevYear, prevMonth, 16, 23, 59, 59, 999))
    const secondQEndStart = new Date(Date.UTC(prevYear, prevMonth, prevMonthLastDay, 0, 0, 0))
    const secondQEndEnd   = new Date(Date.UTC(prevYear, prevMonth, prevMonthLastDay, 23, 59, 59, 999))

    // "Día después de que terminó" = día 1 del mes actual (día en que dispara por primera vez,
    // igual que la primera quincena dispara el día 16 = el día siguiente al 15)
    const dayAfterPeriodEnd = new Date(Date.UTC(veYear, veMonth - 1, 1))
    const daysSincePeriodEnd = Math.floor((todayMid.getTime() - dayAfterPeriodEnd.getTime()) / 86400000)

    if (daysSincePeriodEnd >= 0 && daysSincePeriodEnd % 3 === 0) {
      const period2 = await prisma.period.findFirst({
        where: {
          startDate: { gte: secondQStart, lte: secondQStartEnd },
          endDate:   { gte: secondQEndStart, lte: secondQEndEnd },
        },
        orderBy: { startDate: 'desc' },
        select: { id: true, status: true },
      })

      if (period2?.status !== 'CLOSED') {
        const jose = await prisma.user.findFirst({
          where: { role: 'DUENO', active: true },
          select: { name: true, phone: true, whatsappApiKey: true },
        })
        if (jose?.phone && jose.whatsappApiKey) {
          const text = `📋 *Transporte JR*\nLa quincena del 16 al ${prevMonthLastDay} aún no ha sido cerrada en el sistema. Han pasado ${daysSincePeriodEnd} día${daysSincePeriodEnd === 1 ? '' : 's'} desde que finalizó.`
          try {
            await sendWhatsAppRaw(jose.phone, jose.whatsappApiKey, text)
            result.quincena2 = { sent: true, to: jose.name }
          } catch (e) {
            result.quincena2 = { error: (e as Error).message }
          }
        } else {
          result.quincena2 = { error: 'José phone or apiKey not configured' }
        }
      } else {
        result.quincena2 = { skipped: true, reason: 'period already closed' }
      }
    } else {
      result.quincena2 = { skipped: true, reason: 'not an alert day' }
    }
  }

  // ── 3. Alertas operativas (CxC vencida, mantenimiento, cauchos, préstamos, caja) ──
  // Se envían tanto a José como a Fernando (cualquier DUEÑO/ENCARGADO activo con WhatsApp configurado)
  const opsMessage = await buildOperationalAlertsMessage(todayMid, veDay)
  if (opsMessage) {
    const recipients = await prisma.user.findMany({
      where: { role: { in: ['DUENO', 'ENCARGADO'] }, active: true, phone: { not: null }, whatsappApiKey: { not: null } },
      select: { name: true, phone: true, whatsappApiKey: true },
    })
    // En paralelo, no secuencial — mismo motivo que notify.ts: sin esto, un
    // solo destinatario lento bloquea a los que siguen en la lista.
    const outcomes = await Promise.all(recipients.map(async r => {
      try {
        await sendWhatsAppRaw(r.phone!, r.whatsappApiKey!, opsMessage)
        return { name: r.name, ok: true as const }
      } catch (e) {
        console.error(`CallMeBot error for ${r.name}:`, (e as Error).message)
        return { name: r.name, ok: false as const }
      }
    }))
    result.operational = {
      sent:   outcomes.filter(o => o.ok).map(o => o.name),
      failed: outcomes.filter(o => !o.ok).map(o => o.name),
    }
  } else {
    result.operational = { skipped: true, reason: 'nothing to report' }
  }

  return NextResponse.json(result)
}
