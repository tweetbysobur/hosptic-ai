// Deterministic synthetic maternity data. No real patients. Same seed gives the same file.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function normal(r, mean, sd) {
  const u = Math.max(r(), 1e-9);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

function maternityCsv(n = 300, seed = 42) {
  const r = rng(seed);
  const wards = ["Ward A", "Ward B", "Ward C"];
  const modes = ["Vaginal", "Caesarean"];
  const rows = ["Patient ID,Maternal Age,BMI,Ward,Delivery Mode,Complication,Length of Stay,Birth Weight,Systolic BP Pre,Systolic BP Post"];
  for (let i = 0; i < n; i += 1) {
    const age = Math.round(normal(r, 29, 6));
    const bmi = normal(r, 26, 4).toFixed(1);
    const ward = wards[Math.floor(r() * 3)];
    const mode = r() < 0.3 + (age > 35 ? 0.2 : 0) ? modes[1] : modes[0];
    const complication = r() < 0.12 + (age > 35 ? 0.15 : 0) + (mode === "Caesarean" ? 0.1 : 0) ? "Yes" : "No";
    const stay = Math.max(1, Math.round(normal(r, 2.5 + (ward === "Ward C" ? 1.5 : 0) + (complication === "Yes" ? 2 : 0), 1)));
    const weight = Math.round(normal(r, 3200 + (age - 29) * 8, 450));
    const pre = Math.round(normal(r, 138, 12));
    const post = Math.round(pre - normal(r, 8, 6));
    rows.push([`P${1000 + i}`, age, bmi, ward, mode, complication, stay, weight, pre, post].join(","));
  }
  return Buffer.from(rows.join("\n"), "utf8");
}

module.exports = { maternityCsv };
