import { redirect } from 'next/navigation'

export default function DuenosRedirect() {
  redirect('/camiones?tab=propietarios')
}
