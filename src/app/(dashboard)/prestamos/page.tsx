import { redirect } from 'next/navigation'

export default function PrestamosRedirect() {
  redirect('/caja?tab=prestamos')
}
