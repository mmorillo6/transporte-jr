import { redirect } from 'next/navigation'

export default function CauchosRedirect() {
  redirect('/mantenimiento?tab=cauchos')
}
