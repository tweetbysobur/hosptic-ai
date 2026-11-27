import Button from "@/components/ui/Button";
import SunsetScene from "@/components/landing/SunsetScene";
import MacBook from "@/components/landing/MacBook";
import { HERO } from "@/lib/landing-content";

// The headline sits over the illustrated sunset; the MacBook with the real dashboard follows in its
// own block and rises into the bottom of the scene.
export default function Hero() {
  return (
    <>
      <section className="hero-scene" aria-labelledby="hero-title">
        <SunsetScene className="hero-art" />
        <div className="hero-veil" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-[1200px] px-5 pt-32 pb-48 sm:px-8 sm:pt-40 sm:pb-64 lg:pb-72">
          <div className="max-w-[640px]">
            <h1 id="hero-title" className="text-balance text-[40px] font-extrabold leading-[1.05] tracking-[-0.03em] text-ink sm:text-6xl lg:text-[68px]">
              {HERO.headline.split("Better Decisions.")[0]}
              <span className="text-rose">Better Decisions.</span>
            </h1>
            <p className="mt-6 max-w-[540px] text-pretty text-lg leading-relaxed text-ink sm:text-xl">
              {HERO.description}
            </p>
            <div className="mt-9">
              <Button href="/register">Get Started</Button>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 -mt-36 px-4 sm:-mt-52 sm:px-8 lg:-mt-60" aria-label="Hosptic Provider">
        <figure className="mx-auto w-full max-w-[1080px]">
          <MacBook
            src="/landing/dashboard.webp"
            srcSmall="/landing/dashboard-sm.webp"
            alt="Hosptic Provider answering “Does length of stay differ by mode of delivery?” with the finding, a plain-language explanation and a box plot for each delivery mode."
          />
          <figcaption className="mt-6 text-center text-sm text-ink-2">{HERO.screenshotCaption}</figcaption>
        </figure>
      </section>
    </>
  );
}
