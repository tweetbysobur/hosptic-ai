// The Hosptic mark at illustration scale: the two H pillars in blush, crossed by the ECG
// heartbeat with a coral pulse travelling along it. Shown above the sign-in and registration
// forms on phones and tablets, where the page otherwise has an empty gap. Decorative only.

const TRACE = [
  "M 0 92",
  "L 96 92",
  "C 108 80, 122 80, 134 92",
  "L 176 92",
  "L 186 106",
  "L 200 26",
  "L 214 138",
  "L 224 92",
  "L 262 92",
  "C 276 74, 296 74, 310 92",
  "L 400 92",
].join(" ");

function Cross({ x, y }) {
  return (
    <g className="art-cross" transform={`translate(${x} ${y})`}>
      <rect x="-3" y="-10" width="6" height="20" rx="3" />
      <rect x="-10" y="-3" width="20" height="6" rx="3" />
    </g>
  );
}

export default function AuthArt() {
  return (
    <div className="auth-art" aria-hidden="true">
      <svg viewBox="0 0 400 170" focusable="false">
        <rect className="art-pillar" x="156" y="18" width="30" height="134" rx="15" />
        <rect className="art-pillar" x="214" y="18" width="30" height="134" rx="15" />
        <Cross x={58} y={40} />
        <Cross x={346} y={132} />
        <path className="pulse-track" d={TRACE} pathLength="1000" />
        <path className="pulse-trace" d={TRACE} pathLength="1000" />
      </svg>
    </div>
  );
}
