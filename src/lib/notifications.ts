import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM ?? 'Transporte JR <noreply@baro.cash>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://transporte.vercel.app'

export async function sendEmailNotification({
  to,
  name,
  periodLabel,
  periodId,
}: {
  to: string
  name: string
  periodLabel: string
  periodId: string
}) {
  const url = `${APP_URL}/nomina/${periodId}`
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `Tu relación ${periodLabel} está lista`,
    html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#09090b;font-family:system-ui,-apple-system,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <div style="background:#18181b;border:1px solid #27272a;border-radius:16px;overflow:hidden">
      <div style="background:#f59e0b;padding:20px 24px">
        <p style="margin:0;color:#09090b;font-size:13px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase">Transporte JR</p>
      </div>
      <div style="padding:28px 24px">
        <h1 style="margin:0 0 8px;color:#fff;font-size:22px;font-weight:700">Hola, ${name}</h1>
        <p style="margin:0 0 24px;color:#a1a1aa;font-size:15px;line-height:1.6">
          Tu relación del período <strong style="color:#fff">${periodLabel}</strong> ya está lista.
          Puedes revisarla en la aplicación.
        </p>
        <a href="${url}" style="display:inline-block;background:#f59e0b;color:#09090b;font-weight:700;font-size:14px;padding:12px 24px;border-radius:10px;text-decoration:none">
          Ver mi relación →
        </a>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #27272a">
        <p style="margin:0;color:#52525b;font-size:12px">
          Si tienes alguna duda comunícate con Fernando.<br>
          <a href="${url}" style="color:#71717a">${url}</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`,
  })
  if (error) throw new Error(error.message)
}

export async function sendWhatsAppNotification({
  phone,
  apiKey,
  name,
  periodLabel,
}: {
  phone: string
  apiKey: string
  name: string
  periodLabel: string
}) {
  const text = encodeURIComponent(
    `✅ *Transporte JR*\nHola ${name}, tu relación del período *${periodLabel}* ya está lista. Revísala en la app.`
  )
  const digits = phone.replace(/\D/g, '')
  const url = `https://api.callmebot.com/whatsapp.php?phone=${digits}&text=${text}&apikey=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`CallMeBot error: ${res.status}`)
}
