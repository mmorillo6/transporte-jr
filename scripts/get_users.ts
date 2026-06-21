import { prisma } from '../src/lib/prisma'
async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true, name: true, role: true } })
  users.forEach(u => console.log(u.email, u.role, u.name))
}
main().finally(() => prisma.$disconnect())
