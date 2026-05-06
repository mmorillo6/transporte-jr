import 'dotenv/config'
import { Pool } from 'pg'

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "DiasInternosEntry" (
      "id"          TEXT        NOT NULL PRIMARY KEY,
      "fecha"       TIMESTAMP   NOT NULL,
      "truckId"     TEXT        NOT NULL REFERENCES "Truck"("id"),
      "conductor"   TEXT        NOT NULL,
      "descripcion" TEXT        NOT NULL DEFAULT 'INTERNO TRONCAL A PLANTA',
      "actividad"   TEXT        NOT NULL DEFAULT 'ACARREO DE ÑUMA DE TRONCAL A PLANTA',
      "horaInicio"  TEXT        NOT NULL,
      "horaFin"     TEXT        NOT NULL,
      "totalHoras"  DOUBLE PRECISION NOT NULL,
      "createdAt"   TIMESTAMP   NOT NULL DEFAULT NOW(),
      "updatedAt"   TIMESTAMP   NOT NULL DEFAULT NOW()
    );
  `)
  console.log('Tabla DiasInternosEntry creada correctamente.')
  await pool.end()
}

main().catch(console.error)
