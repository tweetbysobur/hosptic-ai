import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import { HERO } from "@/lib/landing-content";

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-canvas pb-16 pt-16 sm:pt-24" aria-labelledby="hero-title">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col items-center px-5 text-center sm:px-8">
        <p className="hero-rise inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-semibold text-rose shadow-card">
          <Icon name="Sparkles" size={15} />
          {HERO.eyebrow}
        </p>

        <h1 id="hero-title" className="hero-rise hero-delay-1 mt-7 text-balance text-[40px] font-extrabold leading-[1.04] tracking-[-0.035em] text-ink sm:text-6xl lg:text-[76px]">
          {HERO.headline}
        </h1>

        <p className="hero-rise hero-delay-2 mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-ink-2 sm:text-xl">
          {HERO.description}
        </p>

        <div className="hero-rise hero-delay-3 mt-10 flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
          <Button href="/app">Start Analysing</Button>
          <Button href="#product" variant="secondary">Explore Platform</Button>
        </div>

        <ul className="hero-rise hero-delay-3 mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {HERO.facts.map((f) => (
            <li key={f} className="inline-flex items-center gap-2 text-sm font-medium text-ink-2">
              <span className="grid size-5 place-items-center rounded-full bg-blush text-rose">
                <Icon name="CircleCheck" size={13} strokeWidth={2.25} />
              </span>
              {f}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
