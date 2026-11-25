"use client";

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ErrorBar,
  ReferenceLine, ComposedChart, Line, Area, ScatterChart, Scatter, ZAxis,
} from "recharts";

const C = {
  primary: "var(--chart-primary)",
  secondary: "var(--chart-secondary)",
  highlight: "var(--chart-highlight)",
  grid: "var(--chart-grid)",
  band: "var(--chart-band)",
  axis: "#8a847f",
};
const tick = { fontSize: 12, fill: C.axis };
const fmt = (v, unit) => (v === null || v === undefined ? "—" : `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}${unit === "%" ? "%" : unit ? ` ${unit.trim()}` : ""}`);

function Tip({ active, payload, label, rows }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="tip">
      {label !== undefined && <div className="tip-title">{label}</div>}
      {rows(d).map(([k, v]) => (
        <div className="tip-row" key={k}><span>{k}</span><b>{v}</b></div>
      ))}
    </div>
  );
}

function Legend({ items }) {
  return (
    <div className="legend">
      {items.map((s) => (
        <span key={s.label}><i style={{ background: s.color }} />{s.label}</span>
      ))}
    </div>
  );
}

const heightFor = (n, base = 280) => Math.max(base, n * 34 + 60);

export default function Chart({ chart }) {
  switch (chart.type) {
    case "bar":
      return <RateBars chart={chart} />;
    case "histogram":
      return <Histogram chart={chart} />;
    case "line":
      return <TrendLine chart={chart} />;
    case "hbar":
      return <HBars chart={chart} />;
    case "scatter":
      return <ScatterPlot chart={chart} />;
    case "box":
      return <BoxPlot chart={chart} />;
    default:
      return null;
  }
}

function RateBars({ chart }) {
  const s = chart.series[0];
  const isRate = chart.yUnit === "%";
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chart.data} margin={{ top: 20, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey={chart.xKey} tick={tick} tickLine={false} axisLine={{ stroke: "#d6d3d1" }} interval={0} />
        <YAxis tick={tick} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => (isRate ? `${v}%` : v.toLocaleString())} />
        <Tooltip
          cursor={{ fill: "rgba(28,25,23,0.04)" }}
          content={
            <Tip
              rows={(d) =>
                isRate
                  ? [["Rate", `${d.rate}%`], ["95% CI", `${(d.rate - d.error[0]).toFixed(1)} – ${(d.rate + d.error[1]).toFixed(1)}%`], ["Cases", `${d.k} of ${d.n}`]]
                  : [["Count", d.count.toLocaleString()], ["Share", `${d.share}%`]]
              }
            />
          }
        />
        {chart.reference && (
          <ReferenceLine y={chart.reference.value} stroke="#a8a29e" strokeDasharray="4 4" label={{ value: chart.reference.label, position: "insideTopRight", fontSize: 11, fill: C.axis }} />
        )}
        <Bar dataKey={s.key} radius={[4, 4, 0, 0]} maxBarSize={64} isAnimationActive animationDuration={500}
          label={{ position: "top", fontSize: 12, fill: "#57534e", formatter: (v) => (isRate ? `${v}%` : v.toLocaleString()), offset: chart.errorKey ? 14 : 6 }}>
          {chart.data.map((d) => (
            <Cell key={d[chart.xKey]} fill={chart.highlight === d[chart.xKey] ? C.highlight : C.primary} />
          ))}
          {chart.errorKey && <ErrorBar dataKey={chart.errorKey} width={6} strokeWidth={1.25} stroke="#1c1917" opacity={0.55} />}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function Histogram({ chart }) {
  const s = chart.series[0];
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chart.data} margin={{ top: 8, right: 8, left: 0, bottom: 18 }} barCategoryGap={1}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey={chart.xKey} tick={tick} tickLine={false} axisLine={{ stroke: "#d6d3d1" }}
          label={{ value: chart.xLabel, position: "insideBottom", offset: -12, fontSize: 12, fill: C.axis }} minTickGap={8} />
        <YAxis tick={tick} tickLine={false} axisLine={false} width={44} />
        <Tooltip cursor={{ fill: "rgba(28,25,23,0.04)" }} content={<Tip rows={(d) => [[s.label, d.n.toLocaleString()]]} />} />
        <Bar dataKey={s.key} fill={C.primary} radius={[2, 2, 0, 0]} animationDuration={500} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TrendLine({ chart }) {
  const s = chart.series[0];
  const isRate = chart.yUnit === "%";
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={chart.data} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey={chart.xKey} tick={tick} tickLine={false} axisLine={{ stroke: "#d6d3d1" }} interval={0} />
        <YAxis tick={tick} tickLine={false} axisLine={false} width={48} domain={["auto", "auto"]} tickFormatter={(v) => (isRate ? `${v}%` : v)} />
        <Tooltip
          content={<Tip rows={(d) => [[s.label, fmt(d.value, chart.yUnit)], ["95% CI", `${fmt(d.band[0], chart.yUnit)} – ${fmt(d.band[1], chart.yUnit)}`], ["Records", d.n.toLocaleString()]]} />}
        />
        <Area dataKey={chart.bandKey} stroke="none" fill={C.band} fillOpacity={0.7} isAnimationActive={false} />
        <Line dataKey={s.key} stroke={C.primary} strokeWidth={2}
          dot={(p) => {
            const hl = p.payload[chart.xKey] === chart.highlight;
            return <circle key={p.index} cx={p.cx} cy={p.cy} r={hl ? 5 : 3} fill={hl ? C.highlight : "#fff"} stroke={hl ? C.highlight : C.primary} strokeWidth={2} />;
          }}
          activeDot={{ r: 5 }} animationDuration={600} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function HBars({ chart }) {
  const multi = chart.series.length > 1;
  const colors = multi ? [C.highlight, C.secondary] : [C.primary];
  const unit = chart.yUnit;
  return (
    <>
      {multi && <Legend items={chart.series.map((s, i) => ({ label: s.label, color: colors[i] }))} />}
      <ResponsiveContainer width="100%" height={heightFor(chart.data.length * (multi ? 1.5 : 1))}>
        <BarChart data={chart.data} layout="vertical" margin={{ top: 8, right: 48, left: 8, bottom: 4 }} barGap={2}>
          <CartesianGrid horizontal={false} stroke={C.grid} />
          <XAxis type="number" tick={tick} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}${unit === "%" ? "%" : ""}`} />
          <YAxis type="category" dataKey={chart.xKey} tick={{ ...tick, fill: "#57534e" }} tickLine={false} axisLine={false} width={190} interval={0} />
          <Tooltip cursor={{ fill: "rgba(28,25,23,0.04)" }}
            content={<Tip rows={(d) => chart.series.map((s) => [s.label, fmt(d[s.key], unit)])} />} />
          <ReferenceLine x={0} stroke="#d6d3d1" />
          {chart.series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} fill={colors[i]} radius={[0, 3, 3, 0]} maxBarSize={multi ? 14 : 20} animationDuration={500}
              label={{ position: "right", fontSize: 11.5, fill: "#57534e", formatter: (v) => fmt(v, unit) }}>
              {!multi && chart.data.map((d) => (
                <Cell key={d[chart.xKey]} fill={chart.highlightKeys?.includes(d[chart.xKey]) ? C.highlight : C.primary} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}

function ScatterPlot({ chart }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ScatterChart margin={{ top: 8, right: 12, left: 4, bottom: 22 }}>
        <CartesianGrid stroke={C.grid} />
        <XAxis type="number" dataKey="x" name={chart.xLabel} tick={tick} tickLine={false} axisLine={{ stroke: "#d6d3d1" }} domain={["auto", "auto"]}
          label={{ value: chart.xLabel, position: "insideBottom", offset: -14, fontSize: 12, fill: C.axis }} />
        <YAxis type="number" dataKey="y" name={chart.yLabel} tick={tick} tickLine={false} axisLine={false} width={48} domain={["auto", "auto"]}
          label={{ value: chart.yLabel, angle: -90, position: "insideLeft", fontSize: 12, fill: C.axis, dy: 50 }} />
        <ZAxis range={[18, 18]} />
        <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<Tip rows={(d) => [[chart.xLabel, d.x], [chart.yLabel, d.y]]} />} />
        <Scatter data={chart.data} fill={C.primary} fillOpacity={0.35} isAnimationActive={false} />
        <Scatter data={chart.trend} line={{ stroke: C.highlight, strokeWidth: 2 }} shape={() => <g />} isAnimationActive={false} legendType="none" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// Box plot drawn from stacked bars: an invisible base up to the lower whisker,
// then whisker, lower box, upper box and upper whisker segments.
function BoxPlot({ chart }) {
  const data = chart.data.map((d) => ({
    ...d,
    _base: d.min,
    _w1: d.q1 - d.min,
    _b1: d.median - d.q1,
    _b2: d.q3 - d.median,
    _w2: d.max - d.q3,
  }));
  const cap = (top) => (p) => {
    const { x, y, width, height } = p;
    const cx = x + width / 2;
    const yy = top ? y : y + height;
    return (
      <g>
        <line x1={cx} x2={cx} y1={y} y2={y + height} stroke="#57534e" strokeWidth={1.25} />
        <line x1={cx - width / 5} x2={cx + width / 5} y1={yy} y2={yy} stroke="#57534e" strokeWidth={1.25} />
      </g>
    );
  };
  const box = (bottom) => (p) => {
    const { x, y, width, height } = p;
    return (
      <g>
        <rect x={x} y={y} width={width} height={Math.max(height, 0)} fill="#e2e8f0" stroke="var(--chart-primary)" strokeWidth={1.25} />
        {bottom && <line x1={x} x2={x + width} y1={y} y2={y} stroke="var(--chart-highlight)" strokeWidth={2.5} />}
      </g>
    );
  };
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 4 }} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey={chart.xKey} tick={tick} tickLine={false} axisLine={{ stroke: "#d6d3d1" }} interval={0} />
        <YAxis tick={tick} tickLine={false} axisLine={false} width={48}
          label={{ value: chart.yLabel, angle: -90, position: "insideLeft", fontSize: 12, fill: C.axis, dy: 50 }} />
        <Tooltip cursor={{ fill: "rgba(28,25,23,0.04)" }}
          content={<Tip rows={(d) => [["Median", fmt(d.median, chart.yUnit)], ["Middle 50%", `${d.q1} – ${d.q3}`], ["Mean", fmt(d.mean, chart.yUnit)], ["Range (excl. outliers)", `${d.min} – ${d.max}`], ["Records", d.n.toLocaleString()]]} />} />
        <Bar dataKey="_base" stackId="b" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="_w1" stackId="b" shape={cap(false)} isAnimationActive={false} />
        <Bar dataKey="_b1" stackId="b" shape={box(false)} isAnimationActive={false} />
        <Bar dataKey="_b2" stackId="b" shape={box(true)} isAnimationActive={false} />
        <Bar dataKey="_w2" stackId="b" shape={cap(true)} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
