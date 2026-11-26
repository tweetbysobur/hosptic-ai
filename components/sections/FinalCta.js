import Section from "@/components/layouts/Section";
import Button from "@/components/ui/Button";
import { FINAL_CTA } from "@/lib/landing-content";

export default function FinalCta() {
  return (
    <Section tone="surface" labelledBy="cta-title">
      <div className="mx-auto max-w-2xl text-center">
        <h2 id="cta-title" className="text-balance text-3xl font-extrabold leading-[1.12] tracking-[-0.02em] text-ink sm:text-4xl">{FINAL_CTA.title}</h2>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-lg leading-relaxed text-ink-2">{FINAL_CTA.description}</p>
        <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Button href="/register">Start Analysing</Button>
          <Button href="/login" variant="secondary">Sign In</Button>
        </div>
      </div>
    </Section>
  );
}
