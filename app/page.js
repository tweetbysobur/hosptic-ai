import SiteHeader from "@/components/layouts/SiteHeader";
import SiteFooter from "@/components/layouts/SiteFooter";
import Hero from "@/components/sections/Hero";
import ProductShowcase from "@/components/sections/ProductShowcase";
import ProductIntro from "@/components/sections/ProductIntro";
import HowItWorks from "@/components/sections/HowItWorks";
import Capabilities from "@/components/sections/Capabilities";
import DataAnalysis from "@/components/sections/DataAnalysis";
import UseCases from "@/components/sections/UseCases";
import Privacy from "@/components/sections/Privacy";
import FinalCta from "@/components/sections/FinalCta";
import { buildShowcase } from "@/lib/showcase";

export const metadata = {
  title: "Healthcare Data. Clearer Insights. Better Decisions.",
  description:
    "Transform complex hospital datasets into meaningful insights. Ask questions, uncover patterns and understand your healthcare data with Hosptic AI.",
};

export default function HomePage() {
  const { conversation, datasets, conversations } = buildShowcase();

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-white">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">
        <Hero />
        <ProductShowcase conversation={conversation} datasets={datasets} conversations={conversations} />
        <ProductIntro />
        <HowItWorks />
        <Capabilities />
        <DataAnalysis />
        <UseCases />
        <Privacy />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
