import { prisma } from '../src/lib/prisma'
async function main() {
  const users = await prisma.user.findMany({ select: { email: true, name: true, role: true } })
  console.log(JSON.stringify(users, null, 2))
  await prisma.$disconnect()
}
main()
