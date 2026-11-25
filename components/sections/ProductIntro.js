import Section from "@/components/layouts/Section";
import SectionIntro from "@/components/ui/SectionIntro";
import Icon from "@/components/ui/Icon";
import { PRODUCT_INTRO } from "@/lib/landing-content";

const POINT_ICONS = ["CircleCheck", "Search", "FlaskConical"];

export default function ProductIntro() {
  return (
    <Section id="about" tone="canvas" labelledBy="about-title">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-20">
        <SectionIntro id="about-title" eyebrow={PRODUCT_INTRO.eyebrow} title={PRODUCT_INTRO.title} description={PRODUCT_INTRO.description} />
        <ul className="flex flex-col gap-4">
          {PRODUCT_INTRO.points.map((p, i) => (
            <li key={p.title} className="flex gap-5 rounded-2xl border border-line bg-surface p-6 shadow-card transition duration-300 hover:-translate-y-0.5 hover:border-primary/40">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blush text-rose">
                <Icon name={POINT_ICONS[i]} size={20} />
              </span>
              <div>
                <h3 className="text-lg font-bold text-ink">{p.title}</h3>
                <p className="mt-1 text-[15px] leading-relaxed text-muted">{p.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
