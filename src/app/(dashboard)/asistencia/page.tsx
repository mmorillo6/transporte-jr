import { redirect } from 'next/navigation'

export default function AsistenciaRedirect() {
  redirect('/despacho?tab=asistencia')
}
