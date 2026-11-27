// Landing page copy. Kept apart from components so wording can change without touching layout.

export const NAV_LINKS = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Security", href: "#security" },
];

export const HERO = {
  headline: "Turn Healthcare Data Into Better Decisions.",
  description:
    "Transform complex hospital datasets into meaningful insights. Ask questions, uncover patterns and understand your healthcare data with Hosptic.",
  screenshotCaption: "Hosptic Provider answering a question about a sample maternity dataset.",
};

// Each feature is shown with a real Hosptic screen captured from a sample organisation.
export const PRODUCT = {
  title: "Statistics you can read, check and share",
  features: [
    {
      key: "analysis",
      title: "Ask in plain language",
      text: "Type a question about your data. Hosptic picks a suitable statistical test, runs it on your rows and leads with the finding, then shows the chart and every number behind it.",
      points: ["Box plots, histograms, bar and scatter charts", "Test statistic, p-value, effect size and confidence interval", "Assumptions and limitations stated with every answer"],
    },
    {
      key: "datasets",
      title: "Every dataset in one place",
      text: "Upload CSV or Excel files. Each upload is checked and profiled, so you see rows, columns, file size and status before you ask anything.",
      points: ["Visible only to your organisation", "Missing values and quality issues reported on upload", "Columns that look like personal data are excluded from analysis"],
    },
    {
      key: "reports",
      title: "Reports ready to share",
      text: "Turn any completed analysis into a PDF with the question, dataset, method, findings and visualisation. Reports are saved for everyone in your organisation.",
      points: ["One click from any answer", "Method and variables recorded for review"],
    },
  ],
};

export const HOW_IT_WORKS = {
  title: "How it works",
  steps: [
    { key: "upload", title: "Upload data", text: "Add a CSV or Excel file of your hospital records. Hosptic profiles each column and flags quality issues." },
    { key: "ask", title: "Ask questions", text: "Write your question in plain language, for example \u201cDoes length of stay differ by mode of delivery?\u201d" },
    { key: "insights", title: "Get insights", text: "Read the finding, check the chart and statistics, then save the analysis as a PDF report." },
  ],
};

export const PRIVACY = {
  title: "Built for sensitive hospital data",
  description: "Patient data needs careful handling. These protections are part of how Hosptic is built.",
  items: [
    { icon: "Building2", title: "Separate organisations", text: "Each hospital's records are separated at the database level. One organisation cannot read another's data." },
    { icon: "EyeOff", title: "Personal data kept out", text: "Columns named like personal identifiers are masked in previews and never sent to the AI service." },
    { icon: "Lock", title: "Secure sessions", text: "Sign-in uses HTTP-only cookies with request verification. Tokens are never stored in the browser." },
  ],
  note: "Compliance with local data protection rules depends on how your organisation deploys and governs Hosptic.",
};

export const FINAL_CTA = {
  title: "Ask your first question of your hospital data",
  description: "Create an account for your organisation and upload your first dataset.",
};

export const FOOTER_LINKS = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Security", href: "#security" },
  { label: "Sign In", href: "/login" },
  { label: "Create account", href: "/register" },
];
