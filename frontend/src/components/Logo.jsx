export default function Logo({ size = 40, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
      <circle cx="20" cy="20" r="18" stroke="#b5ff4d" strokeWidth="2" fill="rgba(181,255,77,0.08)" />
      <circle cx="20" cy="20" r="14" stroke="#b5ff4d" strokeWidth="1" opacity="0.3" />
      <text x="20" y="26" textAnchor="middle" fill="#b5ff4d" fontSize="18" fontWeight="800" fontFamily="'Cabinet Grotesk', sans-serif">C</text>
    </svg>
  );
}

export function LogoFull({ className = '' }) {
  return (
    <div className={`logo-full ${className}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Logo size={36} />
      <div>
        <span style={{ color: '#e8e8f0', fontWeight: 700, fontSize: 20, fontFamily: "'Cabinet Grotesk', sans-serif" }}>Chill </span>
        <span style={{ color: '#b5ff4d', fontWeight: 700, fontSize: 20, fontFamily: "'Cabinet Grotesk', sans-serif" }}>No Presura</span>
      </div>
    </div>
  );
}
