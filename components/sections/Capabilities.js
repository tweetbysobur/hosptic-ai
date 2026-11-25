import Section from "@/components/layouts/Section";
import SectionIntro from "@/components/ui/SectionIntro";
import Icon from "@/components/ui/Icon";
import { CAPABILITIES } from "@/lib/landing-content";

export default function Capabilities() {
  return (
    <Section id="capabilities" tone="canvas" labelledBy="capabilities-title">
      <SectionIntro id="capabilities-title" eyebrow={CAPABILITIES.eyebrow} title={CAPABILITIES.title} />
      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {CAPABILITIES.items.map((c) => (
          <article key={c.title} className="rounded-2xl border border-line bg-surface p-7 shadow-card transition duration-300 hover:border-primary/40 hover:shadow-[0_18px_40px_-24px_rgba(37,42,52,0.35)]">
            <span className="inline-flex text-rose">
              <Icon name={c.icon} size={20} />
            </span>
            <h3 className="mt-6 text-lg font-bold text-ink">{c.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">{c.text}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}
