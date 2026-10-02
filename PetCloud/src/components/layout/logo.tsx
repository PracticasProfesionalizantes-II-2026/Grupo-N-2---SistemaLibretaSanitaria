import { PawPrint } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/** `href` cambia según el panel: dentro de la app el logo vuelve al home del rol. */
export function Logo({
  className,
  href = "/",
}: {
  className?: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "text-foreground flex items-center gap-2 text-lg font-bold tracking-tight",
        className,
      )}
    >
      <span className="bg-brand-600 flex size-8 items-center justify-center rounded-lg text-white">
        <PawPrint className="size-5" strokeWidth={2.5} />
      </span>
      PetCloud
    </Link>
  );
}
