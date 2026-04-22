const sharp = require('sharp')
const path = require('path')
const fs = require('fs')

const SRC_ICON  = path.join(__dirname, '../public/assets/logos/logo-icon.png')
const LOGOS_DIR = path.join(__dirname, '../public/assets/logos')
const PUBLIC_DIR = path.join(__dirname, '../public')

async function main() {
  fs.mkdirSync(LOGOS_DIR, { recursive: true })

  // 1. Recortar transparencia y cuadrar el ícono
  const trimmed = await sharp(SRC_ICON)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 })
    .toBuffer({ resolveWithObject: true })

  const { width, height } = trimmed.info
  console.log(`Icono recortado: ${width}x${height}`)

  // Hacer cuadrado tomando el lado menor
  const side = Math.min(width, height)
  const left = Math.floor((width - side) / 2)
  const top  = Math.floor((height - side) / 2)

  const squareBase = sharp(trimmed.data)
    .extract({ left, top, width: side, height: side })

  // 2. Generar tamaños del ícono
  const iconSizes = [512, 192, 96, 64, 32, 16]
  for (const s of iconSizes) {
    const out = path.join(LOGOS_DIR, `logo-icon-${s}.png`)
    await squareBase.clone().resize(s, s).png().toFile(out)
    console.log(`✓ logo-icon-${s}.png`)
  }

  // 3. Copiar a /public para favicon y PWA
  await squareBase.clone().resize(512, 512).png()
    .toFile(path.join(PUBLIC_DIR, 'android-chrome-512x512.png'))
  await squareBase.clone().resize(192, 192).png()
    .toFile(path.join(PUBLIC_DIR, 'android-chrome-192x192.png'))
  await squareBase.clone().resize(180, 180).png()
    .toFile(path.join(PUBLIC_DIR, 'apple-touch-icon.png'))
  await squareBase.clone().resize(32, 32).png()
    .toFile(path.join(PUBLIC_DIR, 'favicon-32x32.png'))
  await squareBase.clone().resize(16, 16).png()
    .toFile(path.join(PUBLIC_DIR, 'favicon-16x16.png'))

  console.log('✓ Todos los archivos generados')
}

main().catch(err => { console.error(err); process.exit(1) })
