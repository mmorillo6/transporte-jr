import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'MECANICO') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { action, entryId } = await req.json()

  if (action === 'in') {
    await prisma.clockEntry.create({
      data: { userId: session.userId, clockIn: new Date() },
    })
    return NextResponse.json({ ok: true })
  }

  if (action === 'out' && entryId) {
    await prisma.clockEntry.update({
      where: { id: entryId },
      data: { clockOut: new Date() },
    })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
}
