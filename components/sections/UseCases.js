import Section from "@/components/layouts/Section";
import SectionIntro from "@/components/ui/SectionIntro";
import Icon from "@/components/ui/Icon";
import { USE_CASES } from "@/lib/landing-content";

export default function UseCases() {
  return (
    <Section id="solutions" tone="canvas" labelledBy="solutions-title">
      <SectionIntro id="solutions-title" eyebrow={USE_CASES.eyebrow} title={USE_CASES.title} />
      <div className="mt-14 grid gap-5 sm:grid-cols-2">
        {USE_CASES.items.map((u) => (
          <article key={u.title} className="flex gap-5 rounded-2xl border border-line bg-surface p-7 shadow-card transition duration-300 hover:border-primary/40">
            <span className="inline-flex shrink-0 text-rose">
              <Icon name={u.icon} size={22} />
            </span>
            <div>
              <h3 className="text-lg font-bold text-ink">{u.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{u.text}</p>
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}
