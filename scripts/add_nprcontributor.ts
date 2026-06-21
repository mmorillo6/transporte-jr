import { prisma } from '../src/lib/prisma'

async function main() {
  // Agregar columna si no existe
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Owner" ADD COLUMN IF NOT EXISTS "nprContributor" BOOLEAN NOT NULL DEFAULT false
  `)
  console.log('Columna nprContributor agregada/verificada')

  // Marcar propios como nprContributor=true
  const propios = await prisma.owner.updateMany({
    where: { type: 'PROPIO', isNPROwner: false },
    data: { nprContributor: true },
  })
  console.log(`Propios marcados: ${propios.count}`)

  // Marcar De Freita explícitamente (AFILIADO que sí aporta al NPR)
  const defreita = await prisma.owner.updateMany({
    where: { name: { contains: 'Freita', mode: 'insensitive' } },
    data: { nprContributor: true },
  })
  console.log(`De Freita marcado: ${defreita.count}`)

  // Verificar resultado
  const owners = await prisma.owner.findMany({
    select: { name: true, type: true, isNPROwner: true, nprContributor: true }
  })
  console.log('\nEstado final:')
  for (const o of owners) {
    console.log(`  ${o.name.padEnd(25)} type=${o.type.padEnd(8)} isNPROwner=${String(o.isNPROwner).padEnd(5)} nprContributor=${o.nprContributor}`)
  }
}
main().catch(console.error).finally(() => prisma.$disconnect())
