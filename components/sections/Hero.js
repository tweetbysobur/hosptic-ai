import Button from "@/components/ui/Button";
import { HERO } from "@/lib/landing-content";

// Hero and product image share one section, so nothing can sit between the copy and the screenshot.
export default function Hero() {
  return (
    <section id="product" className="scroll-mt-20 bg-canvas pt-16 pb-20 sm:pt-24 sm:pb-28" aria-labelledby="hero-title">
      <div className="mx-auto flex w-full max-w-[880px] flex-col items-center px-5 text-center sm:px-8">
        <h1 id="hero-title" className="text-balance text-[40px] font-extrabold leading-[1.05] tracking-[-0.035em] text-ink sm:text-6xl lg:text-[72px]">
          {HERO.headline}
        </h1>
        <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-ink-2 sm:text-xl">
          {HERO.description}
        </p>
        <div className="mt-10 flex w-full flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row sm:items-center">
          <Button href="/app">Start Analysing</Button>
          <Button href="#about" variant="secondary">Explore Platform</Button>
        </div>
      </div>

      <figure className="mx-auto mt-14 w-full max-w-[1200px] px-5 sm:mt-16 sm:px-8">
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-showcase">
          <picture>
            <source media="(max-width: 640px)" srcSet="/product/provider-mobile.webp" width={780} height={1560} />
            <img
              src="/product/provider-desktop.webp"
              width={2880}
              height={1800}
              alt="The Hosptic Provider workspace answering “Compare maternal complication rates across the four quarters” with a headline finding, a plain-language explanation and a bar chart with confidence intervals."
              className="block h-auto w-full"
              fetchPriority="high"
              decoding="async"
            />
          </picture>
        </div>
        <figcaption className="mt-4 text-center text-sm text-muted">{HERO.screenshotCaption}</figcaption>
      </figure>
    </section>
  );
}
