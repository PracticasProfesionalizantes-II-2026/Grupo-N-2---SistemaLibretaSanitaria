import { CorporateBanner } from "@/features/public-site/components/corporate-banner";
import { FaqSection } from "@/features/public-site/components/faq-section";
import { FeaturesGrid } from "@/features/public-site/components/features-grid";
import { ForEachActor } from "@/features/public-site/components/for-each-actor";
import { Hero } from "@/features/public-site/components/hero";
import { HowItWorks } from "@/features/public-site/components/how-it-works";
import { PetMascot } from "@/features/public-site/components/pet-mascot";
import { ProblemSection } from "@/features/public-site/components/problem-section";

export default function HomePage() {
  return (
    <>
      <Hero />
      <ProblemSection />
      <HowItWorks />
      <FeaturesGrid />
      <ForEachActor />
      <CorporateBanner />
      <FaqSection />
      <PetMascot />
    </>
  );
}
