// Landing page copy. Kept apart from components so wording can change without touching layout.

export const NAV_LINKS = [
  { label: "Product", href: "#product" },
  { label: "Solutions", href: "#solutions" },
  { label: "About", href: "#about" },
];

export const HERO = {
  eyebrow: "Hosptic Provider",
  headline: "Healthcare Data. Clearer Insights. Better Decisions.",
  description:
    "Transform complex hospital datasets into meaningful insights. Ask questions, uncover patterns and understand your healthcare data with Hosptic AI.",
};

export const SHOWCASE = {
  eyebrow: "The product",
  title: "See the analysis workspace in action",
  description:
    "This is the live Hosptic Provider workspace, running on synthetic demonstration data. Pick a dataset, ask a question and read the finding with the evidence behind it.",
  caption: "Synthetic demonstration data. Results are computed by the analysis engine in real time.",
};

export const PRODUCT_INTRO = {
  eyebrow: "About Hosptic AI",
  title: "Analysis that explains itself",
  description:
    "Hosptic AI helps clinical, research and management teams read their hospital data without writing code. Each answer leads with the finding, then shows the evidence, the method and the limits of what the data can say.",
  points: [
    { title: "Findings first", text: "Every answer opens with the main result in one clear sentence." },
    { title: "Evidence you can inspect", text: "Charts and tables show the numbers behind each claim." },
    { title: "Technical detail on request", text: "Methods, assumptions and limitations are one click away." },
  ],
};

export const HOW_IT_WORKS = {
  eyebrow: "How it works",
  title: "From dataset to decision in four steps",
  steps: [
    {
      title: "Choose your datasets",
      text: "Select the datasets you want to analyse. Hosptic loads their variables, units and missing-data counts.",
    },
    {
      title: "Ask in plain language",
      text: "Type a question such as “Compare readmission rates by department”. No query language is needed.",
    },
    {
      title: "Review the answer",
      text: "Read the headline and explanation, then inspect the charts, tables and interpretation.",
    },
    {
      title: "Share a report",
      text: "Turn a conversation into a structured report you can print, download or share with colleagues.",
    },
  ],
};

export const CAPABILITIES = {
  eyebrow: "Core capabilities",
  title: "Everything you need to question your data",
  items: [
    {
      icon: "GitCompareArrows",
      title: "Group comparisons",
      text: "Compare rates or averages between wards, departments or quarters, with the appropriate test applied.",
    },
    {
      icon: "TrendingUp",
      title: "Trends over time",
      text: "Follow a measure month by month or quarter and see where the pattern changes.",
    },
    {
      icon: "ChartNoAxesColumn",
      title: "Distributions",
      text: "See how values such as length of stay are spread, with summary statistics and outliers.",
    },
    {
      icon: "Search",
      title: "Factors linked to an outcome",
      text: "Rank the variables most associated with an outcome, so you know where to look first.",
    },
    {
      icon: "ClipboardCheck",
      title: "Data completeness checks",
      text: "Identify missing values in each variable before you draw conclusions from them.",
    },
    {
      icon: "FileText",
      title: "Structured reports",
      text: "Compile analyses into sections with tables, charts and plain-language summaries.",
    },
  ],
};

export const DATA_ANALYSIS = {
  eyebrow: "Data analysis features",
  title: "Rigorous methods, presented plainly",
  description:
    "Hosptic chooses a suitable statistical approach from the type of each variable. The method is always stated, so your team can check it.",
  items: [
    {
      icon: "Activity",
      title: "Tests matched to the data",
      text: "Welch t-tests, chi-square tests, ANOVA and Pearson correlation are selected from the variable types.",
    },
    {
      icon: "Scale",
      title: "Uncertainty stated",
      text: "Rates come with Wilson confidence intervals, and means come with t-based intervals.",
    },
    {
      icon: "Layers",
      title: "Multiple comparisons adjusted",
      text: "When many groups are compared, p-values are adjusted with the Holm method to limit false positives.",
    },
    {
      icon: "EyeOff",
      title: "Associations, not causes",
      text: "Results describe what is linked in the data. Hosptic states when a finding cannot establish cause.",
    },
  ],
};

export const USE_CASES = {
  eyebrow: "Healthcare use cases",
  title: "Built for the questions hospitals ask every week",
  items: [
    {
      icon: "HeartPulse",
      title: "Maternal and antenatal care",
      text: "Track complication rates, antenatal visit patterns and referrals across quarters.",
    },
    {
      icon: "Hospital",
      title: "Admissions and length of stay",
      text: "Review length of stay and readmissions, and the factors linked to them.",
    },
    {
      icon: "Stethoscope",
      title: "Clinical research units",
      text: "Explore variables before designing a study, and check how complete the data is.",
    },
    {
      icon: "Building2",
      title: "Hospital management",
      text: "Monitor operational trends and compare performance between wards or departments.",
    },
  ],
};

export const PRIVACY = {
  eyebrow: "Data privacy and security",
  title: "Designed for sensitive hospital data",
  description:
    "Patient data needs careful handling. Hosptic analyses only the datasets and variables you select, states its method for every result, and can run inside your own environment.",
  items: [
    {
      icon: "Server",
      title: "Deploy where your data sits",
      text: "Run Hosptic inside your hospital environment, so you decide where datasets are stored.",
    },
    {
      icon: "ShieldCheck",
      title: "Only the variables you choose",
      text: "Each analysis uses the datasets and variables you select, and nothing else.",
    },
    {
      icon: "Lock",
      title: "Your environment, your rules",
      text: "Your organisation decides where Hosptic runs and how its outputs are stored and shared.",
    },
    {
      icon: "FileText",
      title: "Traceable results",
      text: "Every result states its method, assumptions and limitations, so it can be reviewed.",
    },
  ],
  note:
    "Compliance with local data protection rules depends on how your organisation deploys and governs Hosptic.",
};

export const FINAL_CTA = {
  title: "Ask your first question of your hospital data",
  description: "Open the workspace, choose a dataset and get a clear, evidence-backed answer.",
};

export const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Product", href: "#product" },
      { label: "Core capabilities", href: "#capabilities" },
      { label: "Data analysis", href: "#analysis" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "Healthcare use cases", href: "#solutions" },
      { label: "How it works", href: "#how-it-works" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#about" },
      { label: "Privacy and security", href: "#security" },
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
