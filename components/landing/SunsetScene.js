// Illustrated hero backdrop: a modern hospital campus at sunset. Drawn in SVG so it stays sharp at
// every size and weighs a few kilobytes. Decorative only. The hospital sits on the right so the
// headline on the left reads against open sky.

const WINDOW_ROWS = (x, y, cols, rows, w = 22, h = 15, gx = 8, gy = 11) => {
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push(<rect key={`${x}-${r}-${c}`} x={x + c * (w + gx)} y={y + r * (h + gy)} width={w} height={h} rx="1.5" />);
    }
  }
  return out;
};

// Horizontal glass bands with thin mullions, one per floor.
const RIBBONS = (x, y, w, floors, h = 14, gap = 16, mullion = 34) => {
  const out = [];
  for (let f = 0; f < floors; f++) {
    const yy = y + f * (h + gap);
    out.push(<rect key={`r${x}-${f}`} x={x} y={yy} width={w} height={h} rx="1" fill="url(#ss-glass)" />);
    for (let m = x + mullion; m < x + w; m += mullion) out.push(<rect key={`m${x}-${f}-${m}`} x={m} y={yy} width="2" height={h} fill="#7d6566" opacity="0.35" />);
  }
  return out;
};

function Tree({ x, y, s = 1, tone = "mid" }) {
  const dark = tone === "near" ? "#4f5a36" : "#66703f";
  const lit = tone === "near" ? "#8d8a4a" : "#a9a35c";
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-5" y="-6" width="10" height="70" rx="4" fill="#5b4a3c" />
      <circle cx="0" cy="-60" r="58" fill={dark} />
      <circle cx="-42" cy="-30" r="40" fill={dark} />
      <circle cx="40" cy="-34" r="44" fill={dark} />
      <circle cx="22" cy="-78" r="36" fill={lit} opacity="0.55" />
      <circle cx="52" cy="-46" r="26" fill={lit} opacity="0.5" />
    </g>
  );
}

function Cypress({ x, y, s = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="-80" rx="22" ry="86" fill="#56603a" />
      <ellipse cx="7" cy="-92" rx="10" ry="62" fill="#a7a05a" opacity="0.55" />
    </g>
  );
}

export default function SunsetScene({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ss-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6dccd" />
          <stop offset="0.38" stopColor="#f9cfae" />
          <stop offset="0.62" stopColor="#ffd8a3" />
          <stop offset="0.8" stopColor="#ffe6c4" />
        </linearGradient>
        <radialGradient id="ss-blush" cx="0.15" cy="0.05" r="0.7">
          <stop offset="0" stopColor="#ffc9d3" stopOpacity="0.75" />
          <stop offset="1" stopColor="#ffc9d3" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ss-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff6e2" />
          <stop offset="0.35" stopColor="#ffe3a8" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ffcf8a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ss-facade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f7e9df" />
          <stop offset="1" stopColor="#e6cbbd" />
        </linearGradient>
        <linearGradient id="ss-side" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#d9b4a5" />
          <stop offset="1" stopColor="#c99d8f" />
        </linearGradient>
        <linearGradient id="ss-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd9ae" />
          <stop offset="0.45" stopColor="#e59a83" />
          <stop offset="1" stopColor="#6f5a64" />
        </linearGradient>
        <linearGradient id="ss-lawn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a9a565" />
          <stop offset="1" stopColor="#6f7444" />
        </linearGradient>
        <linearGradient id="ss-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3e3" stopOpacity="0" />
          <stop offset="1" stopColor="#fff3e3" stopOpacity="0.28" />
        </linearGradient>
        <filter id="ss-soft" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
      </defs>

      {/* Sky, warm light and clouds */}
      <rect width="1600" height="900" fill="url(#ss-sky)" />
      <rect width="1600" height="900" fill="url(#ss-blush)" />
      <circle cx="1010" cy="600" r="330" fill="url(#ss-sun)" />
      <circle cx="1010" cy="600" r="54" fill="#fff4dc" opacity="0.95" />
      <g filter="url(#ss-soft)" opacity="0.7">
        <ellipse cx="420" cy="230" rx="260" ry="26" fill="#fff1ea" />
        <ellipse cx="1180" cy="170" rx="320" ry="22" fill="#ffe9e2" />
        <ellipse cx="860" cy="330" rx="220" ry="18" fill="#fff0e0" />
      </g>

      {/* Distant hills */}
      <path d="M0 640 C 180 600, 330 612, 520 628 S 860 600, 1040 624 S 1380 596, 1600 618 V 900 H 0 Z" fill="#e9b8a5" opacity="0.75" />
      <path d="M0 684 C 220 650, 420 668, 640 676 S 1000 656, 1220 672 S 1480 660, 1600 668 V 900 H 0 Z" fill="#d9a18f" opacity="0.8" />

      {/* Hospital: main tower, east wing and podium, lit from the sun on the left */}
      <g>
        <ellipse cx="1290" cy="756" rx="330" ry="14" fill="#7d5d52" opacity="0.18" />
        <rect x="1118" y="352" width="250" height="400" fill="url(#ss-facade)" />
        <rect x="1368" y="366" width="48" height="386" fill="url(#ss-side)" />
        <rect x="1110" y="340" width="268" height="16" rx="3" fill="#f6e4d9" />
        <rect x="1368" y="354" width="56" height="12" fill="#d9b8aa" />
        <g>{RIBBONS(1132, 380, 222, 12, 15, 15, 37)}</g>
        <rect x="1118" y="352" width="10" height="400" fill="#fff" opacity="0.35" />
        <g fill="#b98f86" opacity="0.45">{[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((f) => <rect key={f} x="1370" y={386 + f * 30} width="44" height="10" />)}</g>

        <rect x="1360" y="512" width="236" height="240" fill="url(#ss-facade)" />
        <rect x="1352" y="500" width="252" height="14" rx="3" fill="#f6e4d9" />
        <g>{RIBBONS(1376, 534, 206, 6, 15, 17, 34)}</g>

        <rect x="980" y="622" width="420" height="130" fill="#f5e6dc" />
        <rect x="972" y="610" width="436" height="14" rx="3" fill="#ead2c4" />
        <g>{RIBBONS(996, 642, 388, 2, 20, 16, 48)}</g>
        {/* Entrance canopy and lit doors */}
        <rect x="1034" y="700" width="162" height="9" rx="2" fill="#cfae9f" />
        <rect x="1058" y="709" width="114" height="43" fill="#ffe8c7" />
        <rect x="1058" y="709" width="114" height="43" fill="url(#ss-glass)" opacity="0.35" />
        <g stroke="#b98f80" strokeWidth="2">
          <line x1="1096" y1="709" x2="1096" y2="752" />
          <line x1="1134" y1="709" x2="1134" y2="752" />
        </g>
        {/* Hospital sign: a small cross in the brand coral */}
        <g transform="translate(1242 318)">
          <rect x="-20" y="-20" width="40" height="40" rx="9" fill="#ff6082" />
          <rect x="-4" y="-13" width="8" height="26" rx="2" fill="#fff" />
          <rect x="-13" y="-4" width="26" height="8" rx="2" fill="#fff" />
        </g>
      </g>

      {/* Ground, path and planting */}
      <path d="M0 748 C 300 736, 700 740, 1000 744 S 1400 736, 1600 742 V 900 H 0 Z" fill="url(#ss-lawn)" />
      <path d="M1115 752 C 1060 800, 960 850, 820 900 H 980 C 1060 860, 1120 806, 1150 752 Z" fill="#ecd6c4" opacity="0.9" />
      <rect width="1600" height="900" fill="url(#ss-haze)" />

      <Cypress x={960} y={752} s={0.9} />
      <Cypress x={1438} y={752} s={1} />
      <Cypress x={1560} y={756} s={0.85} />
      <Tree x={110} y={790} s={1.25} tone="near" />
      <Tree x={330} y={776} s={0.8} />
      <Tree x={880} y={786} s={0.85} />
      <Tree x={1520} y={812} s={1.15} tone="near" />
      <g fill="#5f6a3b">
        <ellipse cx="1010" cy="760" rx="40" ry="16" />
        <ellipse cx="1210" cy="760" rx="52" ry="16" />
        <ellipse cx="1330" cy="762" rx="44" ry="15" />
      </g>
    </svg>
  );
}
