import { redirect } from 'next/navigation'

export default function GastosRedirect() {
  redirect('/caja?tab=gastos')
}
