import Section from "@/components/layouts/Section";
import Icon from "@/components/ui/Icon";
import { ShieldArt } from "@/components/landing/Illustrations";
import { PRIVACY } from "@/lib/landing-content";

export default function Privacy() {
  return (
    <Section id="security" tone="canvas" labelledBy="security-title">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
        <div>
          <h2 id="security-title" className="text-balance text-3xl font-extrabold leading-[1.12] tracking-[-0.02em] text-rose sm:text-4xl">{PRIVACY.title}</h2>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-ink-2">{PRIVACY.description}</p>
          <div className="security-art"><ShieldArt /></div>
          <p className="mt-6 text-sm leading-relaxed text-ink-2">{PRIVACY.note}</p>
        </div>
        <ul className="grid gap-8">
          {PRIVACY.items.map((p) => (
            <li key={p.title} className="border-t border-line pt-6">
              <Icon name={p.icon} size={20} className="text-rose" />
              <h3 className="mt-4 text-[17px] font-bold text-ink">{p.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{p.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
