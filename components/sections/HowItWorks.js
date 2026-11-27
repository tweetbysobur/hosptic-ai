import Section from "@/components/layouts/Section";
import { UploadArt, AskArt, InsightArt } from "@/components/landing/Illustrations";
import { HOW_IT_WORKS } from "@/lib/landing-content";

const ART = { upload: UploadArt, ask: AskArt, insights: InsightArt };

export default function HowItWorks() {
  return (
    <Section id="how-it-works" tone="surface" labelledBy="how-title">
      <h2 id="how-title" className="text-3xl font-extrabold tracking-[-0.02em] text-rose sm:text-4xl">{HOW_IT_WORKS.title}</h2>
      <ol className="mt-14 grid gap-12 md:grid-cols-3 md:gap-8">
        {HOW_IT_WORKS.steps.map((s) => {
          const Art = ART[s.key];
          return (
            <li key={s.key} className="flex flex-col">
              <div className="how-art"><Art /></div>
              <h3 className="mt-6 text-xl font-bold text-ink">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{s.text}</p>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
