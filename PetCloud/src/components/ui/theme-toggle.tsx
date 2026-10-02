"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { useIsMounted } from "@/lib/use-is-mounted";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useIsMounted();

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-10 items-center justify-center rounded-lg"
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
    >
      {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  );
}
