"use client";

import dynamic from "next/dynamic";

// page-mascot reads window and pointer events, so it must never render on the server.
const Mascot = dynamic(() => import("page-mascot").then((mod) => mod.Mascot), {
  ssr: false,
});

export function PetMascot() {
  return (
    <div className="fixed top-20 right-4 z-50 hidden md:block">
      <Mascot
        directions="/mascots/cat-directions.webp"
        reactions="/mascots/cat-reactions.webp"
        label="PetCloud cat mascot"
      />
    </div>
  );
}
