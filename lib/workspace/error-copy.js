// Titles, explanations and actions for each analysis error kind (see live-adapter.js).

export const ERROR_STATES = {
  invalid: { title: "This question needs a little more detail", action: "rephrase" },
  unsupported: { title: "This question can’t be answered with this dataset", action: "suggest" },
  missing: { title: "The dataset isn’t available", action: "dataset" },
  session: { title: "Your session has ended", action: "signin" },
  forbidden: { title: "Your role can’t run this", action: null },
  rate: { title: "Too many requests", action: "retry" },
  timeout: { title: "The analysis took too long", action: "retry" },
  network: { title: "The Hosptic service couldn’t be reached", action: "retry" },
  failed: { title: "This analysis couldn’t be completed", action: "retry" },
};

// Titles and short explanations written for people. The backend's own reason is kept and shown
// underneath when it adds information.
export function errorCopy(error, datasetName) {
  const kind = ERROR_STATES[error.kind] ? error.kind : "failed";
  if (kind === "unsupported") {
    return {
      title: `Hosptic couldn\u2019t match this question to the columns in ${datasetName || "this dataset"}.`,
      text: "Try naming the columns you mean, or pick one of the questions below.",
      reason: error.message,
    };
  }
  if (kind === "session") return { title: ERROR_STATES.session.title, text: "Sign in again to continue. Your conversations stay on this device.", reason: null };
  return { title: ERROR_STATES[kind].title, text: `${error.message}.`, reason: null };
}

