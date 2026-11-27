import Section from "@/components/layouts/Section";
import { PRODUCT } from "@/lib/landing-content";

// Real Hosptic screens, captured from a sample organisation. Nothing here is drawn or mocked.
const VISUALS = {
  analysis: (
    <div className="shot-stack">
      <img src="/landing/analytics-box.webp" width={1544} height={798} alt="Box plot of length of stay for vaginal, caesarean and assisted deliveries, with caesarean highlighted as the highest." className="shot shot-back" loading="lazy" decoding="async" />
      <img src="/landing/analytics-scatter.webp" width={1544} height={800} alt="Scatter plot of birth weight against maternal age, one dot per delivery." className="shot shot-front" loading="lazy" decoding="async" />
    </div>
  ),
  datasets: (
    <div className="shot-panel">
      <img src="/landing/datasets.webp" width={2000} height={480} alt="The Datasets page listing Maternal Outcomes 2025 with 1,797 rows, 7 columns, CSV 47 KB, status Ready and an Analyse button." className="shot" loading="lazy" decoding="async" />
    </div>
  ),
  reports: (
    <div className="paper">
      <img src="/landing/report.webp" width={1819} height={1180} alt="The first page of a Hosptic PDF report: question, dataset name, rows and columns, and the method used." loading="lazy" decoding="async" />
    </div>
  ),
};

export default function Product() {
  return (
    <Section id="product" tone="canvas" labelledBy="product-title">
      <h2 id="product-title" className="max-w-2xl text-balance text-3xl font-extrabold leading-[1.12] tracking-[-0.02em] text-ink sm:text-4xl">{PRODUCT.title}</h2>
      <div className="mt-16 flex flex-col gap-24 lg:gap-32">
        {PRODUCT.features.map((f, i) => (
          <article key={f.key} className={`grid items-center gap-10 lg:gap-16 ${i % 2 ? "lg:grid-cols-[1.15fr_0.85fr]" : "lg:grid-cols-[0.85fr_1.15fr]"}`}>
            <div className={i % 2 ? "lg:order-2" : ""}>
              <h3 className="text-2xl font-extrabold tracking-[-0.015em] text-ink sm:text-[28px]">{f.title}</h3>
              <p className="mt-4 text-pretty text-[17px] leading-relaxed text-ink-2">{f.text}</p>
              <ul className="mt-6 grid gap-2.5">
                {f.points.map((pt) => (
                  <li key={pt} className="flex gap-3 text-[15px] leading-relaxed text-ink">
                    <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                    {pt}
                  </li>
                ))}
              </ul>
            </div>
            <div className="min-w-0">{VISUALS[f.key]}</div>
          </article>
        ))}
      </div>
    </Section>
  );
}
