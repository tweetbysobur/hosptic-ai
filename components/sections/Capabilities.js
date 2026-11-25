import Section from "@/components/layouts/Section";
import Icon from "@/components/ui/Icon";
import { CAPABILITIES } from "@/lib/landing-content";

export default function Capabilities() {
  return (
    <Section id="capabilities" tone="canvas" labelledBy="capabilities-title">
      <h2 id="capabilities-title" className="text-3xl font-extrabold tracking-[-0.02em] text-ink sm:text-4xl">{CAPABILITIES.title}</h2>
      <ul className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {CAPABILITIES.items.map((c) => (
          <li key={c.title} className="border-t border-line pt-6">
            <Icon name={c.icon} size={22} className="text-rose" />
            <h3 className="mt-5 text-lg font-bold text-ink">{c.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{c.text}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
