// Landing page copy. Kept apart from components so wording can change without touching layout.

export const NAV_LINKS = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Security", href: "#security" },
];

export const HERO = {
  headline: "Healthcare Data. Clearer Insights. Better Decisions.",
  description:
    "Transform complex hospital datasets into meaningful insights. Ask questions, uncover patterns and understand your healthcare data with Hosptic AI.",
  screenshotCaption: "Hosptic Provider, shown with sample data.",
};

export const PRODUCT_INTRO = {
  title: "A research assistant for hospital data",
  paragraphs: [
    "Hosptic Provider lets clinical, research and management teams question their datasets in plain language, without writing code.",
    "Each answer leads with the finding, then shows the evidence and the method behind it. Results describe associations in the data, and every answer says so.",
  ],
};

export const CAPABILITIES = {
  title: "What Hosptic does",
  items: [
    { icon: "Search", title: "Ask in plain language", text: "Type a question about a dataset. Hosptic chooses a suitable statistical method and runs it." },
    { icon: "ChartNoAxesColumn", title: "Answers with evidence", text: "Each answer shows the finding first, followed by charts, tables and the test that was used." },
    { icon: "ClipboardCheck", title: "Data quality checks", text: "Missing values are reported for every variable, so you know what a result rests on." },
    { icon: "FileText", title: "Reports to share", text: "Turn a completed analysis into a report your team can review." },
  ],
};

export const HOW_IT_WORKS = {
  title: "How it works",
  steps: [
    { title: "Choose a dataset", text: "Pick one of the datasets your organisation holds in Hosptic." },
    { title: "Ask a question", text: "For example, “Compare complication rates across the four quarters”." },
    { title: "Review and share", text: "Read the finding, check the evidence and method, then create a report." },
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
  description: "Create an account for your organisation and upload your first dataset."
};

export const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Overview", href: "#product" },
      { label: "What Hosptic does", href: "#capabilities" },
      { label: "How it works", href: "#how-it-works" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#about" },
      { label: "Security", href: "#security" },
    ],
  },
  {
    title: "Access",
    links: [
      { label: "Sign In", href: "/login" },
      { label: "Create account", href: "/register" },
    ],
  },
];
