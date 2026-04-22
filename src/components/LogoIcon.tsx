interface LogoIconProps {
  size?: number
  className?: string
}

export function LogoIcon({ size = 48, className = '' }: LogoIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      style={{ overflow: 'visible' }}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Transporte José Rodríguez"
    >
      {/* Fondo naranja redondeado */}
      <rect x="0" y="0" width="256" height="256" rx="54" fill="#F5A623" />
      {/* Cuerpo/caja de volteo */}
      <path d="M 22 192 L 22 68 C 62 22 130 16 172 68 L 172 192 Z" fill="#111111" />
      {/* Cabina */}
      <path d="M 172 192 L 172 86 L 188 72 L 244 72 L 244 192 Z" fill="#111111" />
      {/* Ventana cabina */}
      <rect x="180" y="90" width="42" height="24" rx="3" fill="#F5A623" />
      {/* Rueda izquierda */}
      <circle cx="68" cy="210" r="22" fill="#111111" />
      {/* Rueda derecha */}
      <circle cx="204" cy="210" r="22" fill="#111111" />
      {/* Línea de piso — sale fuera del cuadro */}
      <line x1="-18" y1="232" x2="274" y2="232" stroke="#F5A623" strokeWidth="7" strokeLinecap="round" />
      {/* Luces sobre la carga */}
      <circle cx="72" cy="50" r="6" fill="#FDE68A" />
      <circle cx="100" cy="38" r="7" fill="#FBBF24" />
      <circle cx="128" cy="43" r="6" fill="#FDE68A" />
      <circle cx="154" cy="37" r="6" fill="#FBBF24" />
    </svg>
  )
}
