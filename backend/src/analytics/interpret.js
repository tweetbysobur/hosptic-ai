// Deterministic plain-language interpretation built only from computed
// results. Used when AI processing is off, not configured, or when the AI
// interpretation fails validation.
const { fmtP, ALPHA } = require("./engine");

const f = (x, d = 2) => (x === null || x === undefined ? "n/a" : Number(x).toFixed(d));
const sigText = (p, test = "the test") =>
  p < ALPHA
    ? `By ${test}, this is statistically significant at the 5% level (p ${p < 0.001 ? "< 0.001" : `= ${fmtP(p)}`}).`
    : `By ${test}, this is not statistically significant at the 5% level (p = ${fmtP(p)}), so the data do not show a reliable difference or association.`;

function strength(abs) {
  if (abs < 0.1) return "negligible";
  if (abs < 0.3) return "weak";
  if (abs < 0.5) return "moderate";
  return "strong";
}

function interpret(analysis) {
  const { methodology: m, results: r } = analysis;
  switch (m.analysisType) {
    case "descriptive":
    case "frequency":
      return r.variables
        .map((v) =>
          v.kind === "numeric"
            ? `${v.column}: n = ${v.n}, mean ${f(v.mean)} (SD ${f(v.sd)}), median ${f(v.median)}, range ${f(v.min)} to ${f(v.max)}.`
            : `${v.column}: ${v.frequencies.slice(0, 5).map((x) => `${x.value} ${f(x.proportion * 100, 1)}%`).join(", ")} (n = ${v.n}).`
        )
        .join(" ");
    case "distribution":
      return `${r.column} has median ${f(r.median)} (IQR ${f(r.q1)} to ${f(r.q3)}) and mean ${f(r.mean)} across ${r.n} values. Skewness is ${f(r.skewness)}${Math.abs(r.skewness) > 1 ? ", so the distribution is clearly lopsided" : ""}.`;
    case "independent_t_test": {
      const [a, b] = r.groups;
      return `Mean ${m.variables.outcome} was ${f(a.mean)} in ${a.group} (n = ${a.n}) and ${f(b.mean)} in ${b.group} (n = ${b.n}), a difference (${r.meanDifferenceLabel}) of ${f(r.meanDifference)} (95% CI ${f(r.confidenceInterval95[0])} to ${f(r.confidenceInterval95[1])}). ${sigText(r.pValue, "Welch's t-test")} Hedges' g is ${f(r.effectSize.hedgesG)}.`;
    }
    case "paired_t_test":
      return `The mean difference (${r.meanDifferenceLabel}) was ${f(r.meanDifference)} across ${r.sampleSize} pairs (95% CI ${f(r.confidenceInterval95[0])} to ${f(r.confidenceInterval95[1])}). ${sigText(r.pValue, "the paired t-test")}`;
    case "one_way_anova": {
      const useWelch = m.preferredResult === "welchAnova";
      const p = useWelch ? r.welchAnova.pValue : r.pValue;
      const means = r.groups.map((g) => `${g.group} ${f(g.mean)}`).join(", ");
      return `Mean ${m.variables.outcome} by ${m.variables.group}: ${means}. ${sigText(p, useWelch ? "Welch's ANOVA" : "one-way ANOVA")} Eta squared is ${f(r.effectSize.etaSquared, 3)}, meaning ${f(r.effectSize.etaSquared * 100, 1)}% of the variation is associated with group membership.`;
    }
    case "chi_square": {
      const fisher = m.preferredResult === "fisherExactP";
      const p = fisher ? r.fisherExactP : r.pValue;
      const or = r.oddsRatio !== undefined ? ` The odds ratio is ${f(r.oddsRatio)} (95% CI ${f(r.oddsRatioCi95[0])} to ${f(r.oddsRatioCi95[1])}).` : "";
      return `${sigText(p, fisher ? "Fisher's exact test" : "the chi-square test")} Cramer's V is ${f(r.effectSize.cramersV, 3)}, a ${strength(r.effectSize.cramersV)} association, based on ${r.sampleSize} patients.${or}`;
    }
    case "pearson_correlation":
    case "spearman_correlation": {
      const c = r.coefficient.value;
      const [x, y] = m.variables.columns;
      return `${x} and ${y} show a ${strength(Math.abs(c))} ${c >= 0 ? "positive" : "negative"} correlation (${r.coefficient.name} = ${f(c, 3)}, 95% CI ${f(r.confidenceInterval95?.[0], 3)} to ${f(r.confidenceInterval95?.[1], 3)}, n = ${r.sampleSize}). ${sigText(r.pValue, "the correlation test")}`;
    }
    case "linear_regression": {
      const s = r.coefficients[1];
      return `Each one-unit increase in ${m.variables.predictor} is associated with a change of ${f(s.estimate, 3)} in ${m.variables.outcome} (95% CI ${f(s.ci95[0], 3)} to ${f(s.ci95[1], 3)}). ${sigText(r.pValue, "the t-test on the slope")} The model explains ${f(r.rSquared * 100, 1)}% of the variation (R squared ${f(r.rSquared, 3)}).`;
    }
    default:
      return "";
  }
}

module.exports = { interpret };
