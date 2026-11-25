import Section from "@/components/layouts/Section";
import { HOW_IT_WORKS } from "@/lib/landing-content";

export default function HowItWorks() {
  return (
    <Section id="how-it-works" tone="surface" labelledBy="how-title">
      <h2 id="how-title" className="text-3xl font-extrabold tracking-[-0.02em] text-ink sm:text-4xl">{HOW_IT_WORKS.title}</h2>
      <ol className="mt-12 grid gap-10 md:grid-cols-3">
        {HOW_IT_WORKS.steps.map((s) => (
          <li key={s.title} className="border-t-2 border-primary pt-6">
            <h3 className="text-lg font-bold text-ink">{s.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{s.text}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
