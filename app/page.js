import SiteHeader from "@/components/layouts/SiteHeader";
import SiteFooter from "@/components/layouts/SiteFooter";
import Hero from "@/components/sections/Hero";
import Product from "@/components/sections/Product";
import HowItWorks from "@/components/sections/HowItWorks";
import Privacy from "@/components/sections/Privacy";
import FinalCta from "@/components/sections/FinalCta";

export const metadata = {
  title: "Hosptic: Turn Healthcare Data Into Better Decisions",
  description:
    "Transform complex hospital datasets into meaningful insights. Ask questions, uncover patterns and understand your healthcare data with Hosptic.",
};

export default function HomePage() {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-white">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">
        <Hero />
        <Product />
        <HowItWorks />
        <Privacy />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
