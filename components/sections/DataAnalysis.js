import Section from "@/components/layouts/Section";
import SectionIntro from "@/components/ui/SectionIntro";
import Icon from "@/components/ui/Icon";
import { DATA_ANALYSIS } from "@/lib/landing-content";

export default function DataAnalysis() {
  return (
    <Section id="analysis" tone="surface" labelledBy="analysis-title">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.25fr] lg:gap-16">
        <SectionIntro id="analysis-title" eyebrow={DATA_ANALYSIS.eyebrow} title={DATA_ANALYSIS.title} description={DATA_ANALYSIS.description} />
        <ul className="grid gap-4 sm:grid-cols-2">
          {DATA_ANALYSIS.items.map((f) => (
            <li key={f.title} className="rounded-2xl border border-line bg-canvas p-6 transition duration-300 hover:border-primary/40 hover:bg-surface">
              <span className="grid size-10 place-items-center rounded-lg bg-surface text-rose shadow-card">
                <Icon name={f.icon} size={18} />
              </span>
              <h3 className="mt-5 text-[17px] font-bold text-ink">{f.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{f.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
