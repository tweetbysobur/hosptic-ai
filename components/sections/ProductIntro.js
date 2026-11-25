import Section from "@/components/layouts/Section";
import { PRODUCT_INTRO } from "@/lib/landing-content";

export default function ProductIntro() {
  return (
    <Section id="about" tone="surface" labelledBy="about-title">
      <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:gap-20">
        <h2 id="about-title" className="text-balance text-3xl font-extrabold leading-[1.12] tracking-[-0.02em] text-ink sm:text-4xl">
          {PRODUCT_INTRO.title}
        </h2>
        <div className="flex flex-col gap-4 text-pretty text-lg leading-relaxed text-ink-2">
          {PRODUCT_INTRO.paragraphs.map((p) => <p key={p}>{p}</p>)}
        </div>
      </div>
    </Section>
  );
}
