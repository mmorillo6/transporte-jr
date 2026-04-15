'use server'
import { headers } from 'next/headers'
import { getSession } from '@/lib/session'

type InvoiceData = {
  category: string
  amount: number | null
  description: string
  date: string | null
}

const VALID_CATEGORIES = ['MECANICA', 'REPUESTO', 'ACEITE', 'CAUCHO', 'VIATICO', 'NOMINA', 'OPERATIVO', 'ADMINISTRATIVO', 'NPR', 'OTRO']

export async function analyzeInvoice(imageUrl: string): Promise<{ data?: InvoiceData; error?: string }> {
  const session = await getSession()
  if (!session || !['DUENO', 'ENCARGADO'].includes(session.role)) return { error: 'No autorizado' }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY no configurada' }

  // Fetch file via HTTP (more reliable than reading from disk in server actions)
  let fileBuffer: Buffer
  try {
    const reqHeaders = await headers()
    const host = reqHeaders.get('host') || 'localhost:3000'
    const protocol = host.startsWith('localhost') ? 'http' : 'https'
    const fileRes = await fetch(`${protocol}://${host}${imageUrl}`)
    if (!fileRes.ok) return { error: 'No se pudo leer el archivo' }
    fileBuffer = Buffer.from(await fileRes.arrayBuffer())
  } catch {
    return { error: 'No se pudo leer el archivo' }
  }

  const ext = imageUrl.toLowerCase().split('.').pop() ?? 'jpg'
  const isPdf = ext === 'pdf'
  const mediaType = isPdf ? 'application/pdf'
    : ext === 'png' ? 'image/png'
    : ext === 'webp' ? 'image/webp'
    : 'image/jpeg'
  const base64 = fileBuffer.toString('base64')

  const prompt = `Eres un asistente para una empresa de transporte venezolana. Analiza esta factura o comprobante de pago y extrae la información.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin markdown:
{
  "category": "<una de: MECANICA, REPUESTO, ACEITE, CAUCHO, VIATICO, NOMINA, OPERATIVO, OTRO>",
  "amount": <número decimal o null>,
  "description": "<descripción breve del bien o servicio, máximo 80 caracteres>",
  "date": "<fecha en formato YYYY-MM-DD o null>"
}

Categorías:
- MECANICA: trabajos de mecánica, mano de obra
- REPUESTO: repuestos, piezas de vehículo
- ACEITE: aceite de motor, lubricantes
- CAUCHO: cauchos, llantas, neumáticos
- VIATICO: viáticos, alimentación, hospedaje
- NOMINA: pagos de nómina, salarios
- OPERATIVO: gastos operativos generales
- ADMINISTRATIVO: gastos comunes del taller o administrativos (Starlink, electrodos, bombonas, teipe, bombillos)
- NPR: gastos propios del camión NPR
- OTRO: cualquier otro gasto`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: isPdf ? 'document' : 'image',
                source: { type: 'base64', media_type: mediaType, data: base64 },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    })

    if (!response.ok) return { error: 'Error al analizar la imagen' }

    const result = await response.json()
    const text = result.content?.[0]?.text ?? ''

    // Extract JSON from response
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return { error: 'No se pudo extraer información de la factura' }

    const parsed = JSON.parse(match[0]) as InvoiceData

    // Validate and sanitize
    if (!VALID_CATEGORIES.includes(parsed.category)) parsed.category = 'OTRO'
    if (typeof parsed.amount !== 'number' || isNaN(parsed.amount)) parsed.amount = null
    if (typeof parsed.description !== 'string') parsed.description = ''
    if (parsed.date && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) parsed.date = null

    return { data: parsed }
  } catch {
    return { error: 'Error de conexión con el servicio de análisis' }
  }
}
