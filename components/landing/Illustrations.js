// Supporting illustrations for the landing page. They explain steps and ideas; they never stand in
// for the product interface, which is always shown with real screenshots.

const INK = "#252a34";
const LINE = "#eae5e3";

function Floor() {
  return <ellipse cx="120" cy="168" rx="78" ry="9" fill="#252a34" opacity="0.07" />;
}

export function UploadArt() {
  return (
    <svg viewBox="0 0 240 180" aria-hidden="true" focusable="false">
      <Floor />
      <g transform="translate(62 24)">
        <rect x="10" y="8" width="104" height="128" rx="10" fill="#f4efec" />
        <rect width="104" height="128" rx="10" fill="#fff" stroke={LINE} strokeWidth="1.5" />
        <rect x="14" y="16" width="44" height="8" rx="4" fill="#d94365" opacity="0.8" />
        {[38, 54, 70, 86, 102].map((y, i) => (
          <g key={y}>
            <rect x="14" y={y} width="76" height="1.5" fill={LINE} />
            <rect x="14" y={y + 5} width={i % 2 ? 30 : 38} height="5" rx="2.5" fill={INK} opacity="0.18" />
            <rect x="60" y={y + 5} width="22" height="5" rx="2.5" fill={INK} opacity="0.12" />
          </g>
        ))}
        <rect x="62" y="-8" width="40" height="20" rx="10" fill="#fff0f3" stroke="#ffd0da" />
        <text x="82" y="6" textAnchor="middle" fontSize="10" fontWeight="700" fill="#d94365" fontFamily="inherit">CSV</text>
      </g>
      <g transform="translate(166 112)">
        <circle r="24" fill="#ff6082" />
        <circle r="24" fill="url(#ua-shine)" />
        <path d="M0 10 V-9 M-8 -1 L0 -9 L8 -1" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
      <defs>
        <radialGradient id="ua-shine" cx="0.35" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function AskArt() {
  return (
    <svg viewBox="0 0 240 180" aria-hidden="true" focusable="false">
      <Floor />
      <g transform="translate(34 30)">
        <path d="M0 14 A14 14 0 0 1 14 0 H150 A14 14 0 0 1 164 14 V56 A14 14 0 0 1 150 70 H40 L20 88 V70 H14 A14 14 0 0 1 0 56 Z" fill="#fff" stroke={LINE} strokeWidth="1.5" />
        <rect x="18" y="20" width="118" height="7" rx="3.5" fill={INK} opacity="0.55" />
        <rect x="18" y="36" width="86" height="7" rx="3.5" fill={INK} opacity="0.35" />
        <rect x="108" y="34" width="2" height="12" fill="#ff6082" />
      </g>
      <g transform="translate(110 108)">
        <rect width="96" height="44" rx="14" fill="#fff0f3" stroke="#ffd0da" />
        <rect x="14" y="13" width="50" height="6" rx="3" fill="#d94365" opacity="0.75" />
        <rect x="14" y="25" width="34" height="6" rx="3" fill="#d94365" opacity="0.35" />
        <circle cx="78" cy="22" r="9" fill="#ff6082" />
        <path d="M78 26 V18 M74.5 21 L78 17.5 L81.5 21" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </svg>
  );
}

export function InsightArt() {
  return (
    <svg viewBox="0 0 240 180" aria-hidden="true" focusable="false">
      <Floor />
      <g transform="translate(148 28) rotate(6)">
        <rect width="62" height="80" rx="6" fill="#fff" stroke={LINE} strokeWidth="1.5" />
        <rect x="10" y="12" width="30" height="5" rx="2.5" fill="#d94365" />
        {[26, 36, 46, 56].map((y) => <rect key={y} x="10" y={y} width={y === 56 ? 26 : 42} height="4" rx="2" fill={INK} opacity="0.18" />)}
        <rect x="34" y="64" width="22" height="10" rx="5" fill="#fff0f3" />
        <text x="45" y="72" textAnchor="middle" fontSize="7" fontWeight="700" fill="#d94365" fontFamily="inherit">PDF</text>
      </g>
      <g transform="translate(30 40)">
        <rect width="136" height="108" rx="12" fill="#fff" stroke={LINE} strokeWidth="1.5" />
        <rect x="14" y="14" width="70" height="7" rx="3.5" fill="#d94365" opacity="0.8" />
        <line x1="14" y1="92" x2="122" y2="92" stroke={LINE} strokeWidth="1.5" />
        {[[22, 58], [50, 34], [78, 48]].map(([x, h], i) => (
          <rect key={x} x={x} y={92 - h} width="20" height={h} rx="3" fill={i === 0 ? "#ff6082" : "#ffd0da"} />
        ))}
        <rect x="106" y="56" width="10" height="36" rx="3" fill="#ffd0da" opacity="0.6" />
      </g>
    </svg>
  );
}

// Shield and lock with soft light, used beside the security section.
export function ShieldArt() {
  return (
    <svg viewBox="0 0 360 360" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="sh-body" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#ff8aa3" />
          <stop offset="0.55" stopColor="#ff6082" />
          <stop offset="1" stopColor="#d94365" />
        </linearGradient>
        <linearGradient id="sh-rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd4dd" />
          <stop offset="1" stopColor="#c93a5a" />
        </linearGradient>
        <linearGradient id="sh-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="lk-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#f1e9e6" />
        </linearGradient>
        <linearGradient id="lk-shackle" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#d8d1ce" />
          <stop offset="0.5" stopColor="#ffffff" />
          <stop offset="1" stopColor="#c7bfbc" />
        </linearGradient>
        <filter id="sh-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>
      <ellipse cx="180" cy="326" rx="104" ry="14" fill="#252a34" opacity="0.12" filter="url(#sh-shadow)" />
      {/* Shield: rim, body and a light face on the upper half */}
      <path d="M180 38 L282 76 V166 C282 232 238 280 180 306 C122 280 78 232 78 166 V76 Z" fill="url(#sh-rim)" />
      <path d="M180 52 L268 85 V166 C268 224 230 266 180 290 C130 266 92 224 92 166 V85 Z" fill="url(#sh-body)" />
      <path d="M180 52 L268 85 V150 C220 160 140 150 92 132 V85 Z" fill="url(#sh-face)" />
      {/* Lock */}
      <path d="M150 158 V136 A30 30 0 0 1 210 136 V158" fill="none" stroke="url(#lk-shackle)" strokeWidth="13" strokeLinecap="round" />
      <rect x="132" y="152" width="96" height="78" rx="14" fill="url(#lk-body)" />
      <rect x="132" y="152" width="96" height="14" rx="7" fill="#fff" opacity="0.7" />
      <circle cx="180" cy="186" r="10" fill="#d94365" />
      <rect x="176" y="190" width="8" height="20" rx="4" fill="#d94365" />
    </svg>
  );
}
