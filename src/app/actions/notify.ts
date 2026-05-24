'use server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { sendEmailNotification, sendWhatsAppNotification } from '@/lib/notifications'

function fmtDate(d: Date | string) {
  const [y, m, day] = new Date(d).toISOString().slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, day, 12).toLocaleDateString('es-VE', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
}

export type NotifyResult = {
  sent: { name: string; email: boolean; whatsapp: boolean }[]
  skipped: { name: string; reason: string }[]
  error?: string
}

export async function notifyPeriodReady(periodId: string): Promise<NotifyResult> {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) {
    return { sent: [], skipped: [], error: 'No autorizado' }
  }

  const period = await prisma.period.findUnique({
    where: { id: periodId },
    select: { status: true, startDate: true, endDate: true },
  })
  if (!period) return { sent: [], skipped: [], error: 'Período no encontrado' }
  if (period.status !== 'CLOSED') return { sent: [], skipped: [], error: 'El período debe estar cerrado primero' }

  const periodLabel = `${fmtDate(period.startDate)} – ${fmtDate(period.endDate)}`

  // Find owner IDs with payroll in this period
  const entries = await prisma.payrollEntry.findMany({
    where: { periodId },
    select: { truck: { select: { ownerId: true } } },
  })
  const ownerIds = [...new Set(entries.map(e => e.truck.ownerId))]

  // Dueños/afiliados vinculados a camiones del período + encargado (siempre)
  const [ownerUsers, encargados] = await Promise.all([
    prisma.user.findMany({
      where: { ownerId: { in: ownerIds }, role: { in: ['DUENO', 'AFILIADO'] }, active: true },
      select: { id: true, name: true, email: true, phone: true, whatsappApiKey: true },
    }),
    prisma.user.findMany({
      where: { role: 'ENCARGADO', active: true },
      select: { id: true, name: true, email: true, phone: true, whatsappApiKey: true },
    }),
  ])
  // Merge sin duplicados por id
  const seen = new Set<string>()
  const users = [...ownerUsers, ...encargados].filter(u => { if (seen.has(u.id)) return false; seen.add(u.id); return true })

  const sent: NotifyResult['sent'] = []
  const skipped: NotifyResult['skipped'] = []

  for (const user of users) {
    let emailOk = false
    let waOk = false

    try {
      await sendEmailNotification({ to: user.email, name: user.name, periodLabel, periodId })
      emailOk = true
    } catch (e) {
      console.error(`Email failed for ${user.name}:`, e)
    }

    if (user.phone && user.whatsappApiKey) {
      try {
        await sendWhatsAppNotification({
          phone: user.phone,
          apiKey: user.whatsappApiKey,
          name: user.name,
          periodLabel,
        })
        waOk = true
      } catch (e) {
        console.error(`WhatsApp failed for ${user.name}:`, e)
      }
    }

    if (emailOk || waOk) {
      sent.push({ name: user.name, email: emailOk, whatsapp: waOk })
    } else {
      skipped.push({ name: user.name, reason: 'No se pudo enviar por ningún canal' })
    }
  }

  if (users.length === 0) {
    skipped.push({ name: '—', reason: 'No hay dueños/afiliados vinculados a camiones de este período' })
  }

  if (sent.length > 0) {
    await prisma.period.update({ where: { id: periodId }, data: { notifiedAt: new Date() } })
  }

  return { sent, skipped }
}
