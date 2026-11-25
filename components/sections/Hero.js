import Button from "@/components/ui/Button";
import { HERO } from "@/lib/landing-content";

export default function Hero() {
  return (
    <section className="bg-canvas pb-20 pt-16 sm:pt-24" aria-labelledby="hero-title">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col items-center px-5 text-center sm:px-8">
        <h1 id="hero-title" className="hero-rise text-balance text-[40px] font-extrabold leading-[1.04] tracking-[-0.035em] text-ink sm:text-6xl lg:text-[76px]">
          {HERO.headline}
        </h1>

        <p className="hero-rise hero-delay-1 mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-ink-2 sm:text-xl">
          {HERO.description}
        </p>

        <div className="hero-rise hero-delay-2 mt-10 flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
          <Button href="/app">Start Analysing</Button>
          <Button href="#product" variant="secondary">Explore Platform</Button>
        </div>

        <a href="/demo" className="hero-rise hero-delay-3 mt-6 text-[15px] font-semibold text-ink underline decoration-primary decoration-2 underline-offset-4 transition hover:text-rose">
          Try the demo with synthetic data, no account needed
        </a>
      </div>
    </section>
  );
}
