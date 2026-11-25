import Section from "@/components/layouts/Section";
import SectionIntro from "@/components/ui/SectionIntro";
import { HOW_IT_WORKS } from "@/lib/landing-content";

export default function HowItWorks() {
  return (
    <Section id="how-it-works" tone="surface" labelledBy="how-title">
      <SectionIntro id="how-title" eyebrow={HOW_IT_WORKS.eyebrow} title={HOW_IT_WORKS.title} align="center" />
      <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {HOW_IT_WORKS.steps.map((s, i) => (
          <li key={s.title} className="group relative flex flex-col rounded-2xl border border-line bg-canvas p-6 transition duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-surface hover:shadow-card">
            <span className="text-sm font-bold tabular-nums text-rose">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="mt-6 text-lg font-bold text-ink">{s.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.text}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
