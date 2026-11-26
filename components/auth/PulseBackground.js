// Brand background for the sign-in and registration pages: the ECG waveform from the Hosptic
// logo, drawn as a faint monitor trace with a coral pulse travelling along it. Decorative only.
// The animation is CSS, and it stops for people who prefer reduced motion.

const WIDTH = 2400;
const BASE = 210;
const BEAT = 600;

// One heartbeat: flat baseline, small P wave, sharp QRS spike, T wave, back to baseline.
function beatPath(x) {
  return [
    `L ${x + 180} ${BASE}`,
    `C ${x + 200} ${BASE - 14}, ${x + 222} ${BASE - 14}, ${x + 240} ${BASE}`,
    `L ${x + 262} ${BASE}`,
    `L ${x + 276} ${BASE + 22}`,
    `L ${x + 298} ${BASE - 120}`,
    `L ${x + 322} ${BASE + 58}`,
    `L ${x + 340} ${BASE}`,
    `L ${x + 380} ${BASE}`,
    `C ${x + 404} ${BASE - 26}, ${x + 436} ${BASE - 26}, ${x + 460} ${BASE}`,
    `L ${x + BEAT} ${BASE}`,
  ].join(" ");
}

const PATH = (() => {
  let d = `M 0 ${BASE}`;
  for (let x = 0; x < WIDTH; x += BEAT) d += ` ${beatPath(x)}`;
  return d;
})();

export default function PulseBackground() {
  return (
    <div className="pulse-bg" aria-hidden="true">
      <svg viewBox={`0 0 ${WIDTH} 420`} preserveAspectRatio="xMidYMid slice" focusable="false">
        <path className="pulse-track" d={PATH} pathLength="1000" />
        <path className="pulse-trace" d={PATH} pathLength="1000" />
      </svg>
    </div>
  );
}
