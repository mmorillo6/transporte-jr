import { redirect } from 'next/navigation'

export default function CuentasPorCobrarRedirect() {
  redirect('/caja?tab=cobrar')
}
