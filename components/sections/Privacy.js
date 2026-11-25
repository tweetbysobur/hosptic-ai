import Section from "@/components/layouts/Section";
import SectionIntro from "@/components/ui/SectionIntro";
import Icon from "@/components/ui/Icon";
import { PRIVACY } from "@/lib/landing-content";

export default function Privacy() {
  return (
    <Section id="security" tone="canvas" labelledBy="security-title" className="!bg-ink">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
        <div>
          <SectionIntro id="security-title" tone="dark" eyebrow={PRIVACY.eyebrow} title={PRIVACY.title} description={PRIVACY.description} />
          <p className="mt-8 max-w-md text-sm leading-relaxed text-white/55">{PRIVACY.note}</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {PRIVACY.items.map((p) => (
            <li key={p.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 transition duration-300 hover:border-primary/50 hover:bg-white/[0.07]">
              <span className="grid size-10 place-items-center rounded-lg bg-primary/15 text-primary">
                <Icon name={p.icon} size={18} />
              </span>
              <h3 className="mt-5 text-[17px] font-bold text-white">{p.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-white/65">{p.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
