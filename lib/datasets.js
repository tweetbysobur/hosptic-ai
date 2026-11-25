// Demo hospital datasets. Records are generated deterministically from a fixed
// seed so every analysis is reproducible. Replace `loadRows` with a database or
// file loader to analyse real data; the engine only relies on the metadata below.

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seed) {
  const u = mulberry32(seed);
  const normal = (m = 0, s = 1) => {
    const a = Math.max(u(), 1e-12);
    return m + s * Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * u());
  };
  const pick = (items, weights) => {
    const total = weights.reduce((x, y) => x + y, 0);
    let r = u() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  };
  return { u, normal, pick, bern: (p) => u() < p };
}

const logistic = (x) => 1 / (1 + Math.exp(-x));
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const quarterOf = (m) => `Q${Math.floor((m - 1) / 3) + 1}`;
const isoDate = (m, d) => `2025-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const ageGroup = (a) => (a < 20 ? "Under 20" : a < 30 ? "20–29" : a < 40 ? "30–39" : "40 and over");

function generateMaternal() {
  const r = makeRng(20250117);
  const rows = [];
  // Quarter-level context: Q3 had a midwife staffing gap (fewer antenatal visits)
  // and more referrals of hypertensive patients.
  const ctx = {
    Q1: { visits: 5.6, htn: 0.1, anaemia: 0.24 },
    Q2: { visits: 5.4, htn: 0.11, anaemia: 0.25 },
    Q3: { visits: 3.6, htn: 0.2, anaemia: 0.31 },
    Q4: { visits: 5.2, htn: 0.12, anaemia: 0.23 },
  };
  let id = 1;
  for (let m = 1; m <= 12; m++) {
    const q = quarterOf(m);
    const c = ctx[q];
    const n = Math.round(150 + r.normal(0, 12));
    for (let i = 0; i < n; i++) {
      const age = Math.round(clamp(r.normal(28, 6.2), 15, 47));
      const parity = Math.round(clamp(r.normal(1.8, 1.4), 0, 7));
      const hypertension = r.bern(c.htn + (age >= 35 ? 0.06 : 0));
      const anaemia = r.bern(c.anaemia);
      const diabetes = r.bern(0.05 + (age >= 35 ? 0.04 : 0));
      const visits = Math.round(clamp(r.normal(c.visits, 2), 0, 12));
      const haemoglobin = Number(clamp(anaemia ? r.normal(9.6, 0.9) : r.normal(12.1, 1), 6, 15.5).toFixed(1));
      const ward = r.pick(["Ward A", "Ward B", "Ward C"], [0.4, 0.35, 0.25]);
      const lp =
        -2.8 +
        1.15 * hypertension +
        0.7 * anaemia +
        0.45 * diabetes -
        0.08 * (visits - 5) +
        (visits < 4 ? 0.7 : 0) +
        (age < 18 ? 0.5 : 0) +
        (age >= 40 ? 0.55 : 0) +
        (parity >= 5 ? 0.35 : 0);
      const complication = r.bern(logistic(lp));
      let complicationType = "None";
      if (complication) {
        complicationType = hypertension
          ? r.pick(["Pre-eclampsia", "Postpartum haemorrhage", "Infection", "Obstructed labour"], [0.55, 0.2, 0.15, 0.1])
          : anaemia
          ? r.pick(["Postpartum haemorrhage", "Infection", "Obstructed labour", "Pre-eclampsia"], [0.5, 0.25, 0.15, 0.1])
          : r.pick(["Postpartum haemorrhage", "Infection", "Obstructed labour", "Pre-eclampsia"], [0.35, 0.3, 0.25, 0.1]);
      }
      const deliveryMode = r.pick(
        ["Vaginal", "Assisted vaginal", "Caesarean"],
        complication ? [0.4, 0.15, 0.45] : [0.72, 0.08, 0.2]
      );
      const los = Math.round(
        clamp(r.normal(deliveryMode === "Caesarean" ? 4.2 : 2.1, 1) + (complication ? r.normal(2.4, 1.2) : 0), 1, 21)
      );
      const birthWeight = Number(
        clamp(r.normal(3.2 - (hypertension ? 0.28 : 0) - (anaemia ? 0.12 : 0) + 0.025 * (visits - 5), 0.48), 1.1, 4.9).toFixed(2)
      );
      rows.push({
        patient_id: `MAT-${String(id++).padStart(5, "0")}`,
        admission_date: isoDate(m, 1 + Math.floor(r.u() * 28)),
        month: MONTHS[m - 1],
        month_index: m,
        quarter: q,
        age,
        age_group: ageGroup(age),
        parity,
        hypertension,
        anaemia,
        diabetes,
        antenatal_visits: r.bern(0.045) ? null : visits,
        haemoglobin: r.bern(0.06) ? null : haemoglobin,
        ward,
        delivery_mode: deliveryMode,
        complication,
        complication_type: complicationType,
        length_of_stay: los,
        birth_weight: birthWeight,
      });
    }
  }
  return rows;
}

function generateAdmissions() {
  const r = makeRng(77031);
  const rows = [];
  const depts = ["Internal Medicine", "Surgery", "Paediatrics", "Obstetrics", "Emergency"];
  let id = 1;
  for (let m = 1; m <= 12; m++) {
    const q = quarterOf(m);
    const n = Math.round(210 + r.normal(0, 15) + (m >= 6 && m <= 9 ? 25 : 0));
    for (let i = 0; i < n; i++) {
      const department = r.pick(depts, [0.3, 0.22, 0.16, 0.14, 0.18]);
      const age = Math.round(
        department === "Paediatrics" ? clamp(r.normal(6, 4), 0, 17) : clamp(r.normal(46, 17), 18, 95)
      );
      const sex = department === "Obstetrics" ? "Female" : r.pick(["Female", "Male"], [0.52, 0.48]);
      const comorbidities = Math.round(clamp(r.normal(age / 30, 1), 0, 6));
      const insured = r.bern(0.46);
      const baseLos = { "Internal Medicine": 6, Surgery: 5.2, Paediatrics: 3.6, Obstetrics: 2.8, Emergency: 1.9 }[department];
      const los = Math.round(clamp(r.normal(baseLos + 0.6 * comorbidities + (m >= 7 && m <= 9 ? 0.7 : 0), 2), 1, 40));
      const readmitted = r.bern(logistic(-2.9 + 0.32 * comorbidities + 0.012 * (age - 45) + (insured ? -0.25 : 0) + (los > 10 ? 0.4 : 0)));
      const discharge = r.pick(["Discharged home", "Transferred", "Left against advice", "Died"], [0.88, 0.05, 0.04, 0.012 + 0.006 * comorbidities]);
      rows.push({
        admission_id: `ADM-${String(id++).padStart(5, "0")}`,
        admission_date: isoDate(m, 1 + Math.floor(r.u() * 28)),
        month: MONTHS[m - 1],
        month_index: m,
        quarter: q,
        department,
        age,
        age_group: age < 18 ? "Under 18" : age < 40 ? "18–39" : age < 65 ? "40–64" : "65 and over",
        sex,
        comorbidities,
        payment: insured ? "Insured" : "Self-pay",
        length_of_stay: los,
        readmitted_30d: readmitted,
        discharge_status: discharge,
      });
    }
  }
  return rows;
}

export const DATASETS = {
  maternal: {
    id: "maternal",
    name: "Maternal Outcomes 2025",
    description: "Every delivery admission in the maternity unit, January to December 2025.",
    unit: "deliveries",
    source: "Maternity register (demo extract)",
    updated: "2026-01-08",
    generate: generateMaternal,
    variables: [
      { key: "patient_id", label: "Patient ID", type: "id" },
      { key: "admission_date", label: "Admission date", type: "date" },
      { key: "month", label: "Month", type: "categorical", order: MONTHS, synonyms: ["monthly", "month", "months"] },
      { key: "quarter", label: "Quarter", type: "categorical", order: ["Q1", "Q2", "Q3", "Q4"], synonyms: ["quarter", "quarters", "quarterly"] },
      { key: "age", label: "Maternal age", type: "numeric", unit: "years", synonyms: ["age", "maternal age"] },
      { key: "age_group", label: "Age group", type: "categorical", order: ["Under 20", "20–29", "30–39", "40 and over"], synonyms: ["age group", "age groups", "age band", "age bands", "by age"] },
      { key: "parity", label: "Parity", type: "numeric", unit: "previous births", synonyms: ["parity", "previous births"] },
      { key: "hypertension", label: "Hypertension", type: "binary", synonyms: ["hypertension", "hypertensive", "blood pressure", "high blood pressure"] },
      { key: "anaemia", label: "Anaemia", type: "binary", synonyms: ["anaemia", "anemia", "anaemic", "anemic"] },
      { key: "diabetes", label: "Diabetes", type: "binary", synonyms: ["diabetes", "diabetic", "gestational diabetes"] },
      { key: "antenatal_visits", label: "Antenatal visits", type: "numeric", unit: "visits", synonyms: ["antenatal", "antenatal visits", "anc", "anc visits", "prenatal visits"] },
      { key: "haemoglobin", label: "Haemoglobin", type: "numeric", unit: "g/dL", synonyms: ["haemoglobin", "hemoglobin", "hb"] },
      { key: "ward", label: "Ward", type: "categorical", order: ["Ward A", "Ward B", "Ward C"], synonyms: ["ward", "wards"] },
      { key: "delivery_mode", label: "Delivery mode", type: "categorical", order: ["Vaginal", "Assisted vaginal", "Caesarean"], synonyms: ["delivery mode", "mode of delivery", "delivery type", "caesarean", "c-section"] },
      { key: "complication", label: "Maternal complication", type: "binary", outcome: true, synonyms: ["complication", "complications", "maternal complication", "maternal complications", "complication rate", "complication rates"] },
      { key: "complication_type", label: "Complication type", type: "categorical", synonyms: ["complication type", "complication types", "type of complication", "types of complication", "which complications"] },
      { key: "length_of_stay", label: "Length of stay", type: "numeric", unit: "days", synonyms: ["length of stay", "los", "stay", "days in hospital"] },
      { key: "birth_weight", label: "Birth weight", type: "numeric", unit: "kg", synonyms: ["birth weight", "birthweight", "baby weight"] },
    ],
  },
  admissions: {
    id: "admissions",
    name: "Hospital Admissions 2025",
    description: "Inpatient admissions across five departments, January to December 2025.",
    unit: "admissions",
    source: "Patient administration system (demo extract)",
    updated: "2026-01-10",
    generate: generateAdmissions,
    variables: [
      { key: "admission_id", label: "Admission ID", type: "id" },
      { key: "admission_date", label: "Admission date", type: "date" },
      { key: "month", label: "Month", type: "categorical", order: MONTHS, synonyms: ["monthly", "month", "months"] },
      { key: "quarter", label: "Quarter", type: "categorical", order: ["Q1", "Q2", "Q3", "Q4"], synonyms: ["quarter", "quarters", "quarterly"] },
      { key: "department", label: "Department", type: "categorical", order: ["Internal Medicine", "Surgery", "Paediatrics", "Obstetrics", "Emergency"], synonyms: ["department", "departments", "unit", "units", "specialty"] },
      { key: "age", label: "Age", type: "numeric", unit: "years", synonyms: ["age", "patient age"] },
      { key: "age_group", label: "Age group", type: "categorical", order: ["Under 18", "18–39", "40–64", "65 and over"], synonyms: ["age group", "age groups", "age band", "by age"] },
      { key: "sex", label: "Sex", type: "categorical", order: ["Female", "Male"], synonyms: ["sex", "gender"] },
      { key: "comorbidities", label: "Comorbidities", type: "numeric", unit: "conditions", synonyms: ["comorbidities", "comorbidity", "chronic conditions"] },
      { key: "payment", label: "Payment type", type: "categorical", order: ["Insured", "Self-pay"], synonyms: ["payment", "insurance", "insured", "self-pay", "payer"] },
      { key: "length_of_stay", label: "Length of stay", type: "numeric", unit: "days", synonyms: ["length of stay", "los", "stay", "days in hospital"] },
      { key: "readmitted_30d", label: "30-day readmission", type: "binary", outcome: true, synonyms: ["readmission", "readmissions", "readmitted", "readmission rate", "readmission rates", "30-day readmission"] },
      { key: "discharge_status", label: "Discharge status", type: "categorical", synonyms: ["discharge", "discharge status", "outcome at discharge", "mortality", "deaths"] },
    ],
  },
};

const cache = {};
export function loadRows(id) {
  if (!cache[id]) cache[id] = DATASETS[id].generate();
  return cache[id];
}

export function datasetSummary(id) {
  const d = DATASETS[id];
  const rows = loadRows(id);
  return {
    id: d.id,
    name: d.name,
    description: d.description,
    unit: d.unit,
    source: d.source,
    updated: d.updated,
    rows: rows.length,
    variables: d.variables
      .filter((v) => v.type !== "id")
      .map((v) => {
        const missing = rows.filter((row) => row[v.key] === null || row[v.key] === undefined).length;
        const values = v.type === "categorical" ? [...new Set(rows.map((row) => row[v.key]))] : undefined;
        return { key: v.key, label: v.label, type: v.type, unit: v.unit || null, missing, levels: values ? (v.order || values.sort()) : undefined };
      }),
  };
}
