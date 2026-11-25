import Section from "@/components/layouts/Section";
import Button from "@/components/ui/Button";
import { FINAL_CTA } from "@/lib/landing-content";

export default function FinalCta() {
  return (
    <Section tone="surface" labelledBy="cta-title">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-blush px-6 py-16 text-center sm:px-12 sm:py-20">
        <h2 id="cta-title" className="mx-auto max-w-2xl text-balance text-3xl font-extrabold leading-[1.12] tracking-[-0.02em] text-ink sm:text-4xl lg:text-[42px]">
          {FINAL_CTA.title}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-base leading-relaxed text-ink-2 sm:text-lg">{FINAL_CTA.description}</p>
        <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Button href="/app">Start Analysing</Button>
          <Button href="#product" variant="secondary">Explore Platform</Button>
        </div>
      </div>
    </Section>
  );
}
