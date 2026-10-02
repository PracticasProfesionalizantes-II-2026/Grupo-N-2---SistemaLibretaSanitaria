import { cn } from "@/lib/utils";

/**
 * Mockup esquemático del panel, para las landings sectoriales.
 *
 * Es una representación abstracta, no una captura real: cuando el panel esté
 * terminado se reemplaza por imágenes. Se dibuja con divs para que acompañe el
 * tema claro/oscuro sin exportar dos versiones de cada captura.
 */
export function PanelMockup({
  sidebarItems,
  title,
  className,
}: {
  sidebarItems: string[];
  title: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border bg-card overflow-hidden rounded-xl border shadow-lg",
        className,
      )}
      aria-hidden
    >
      <div className="border-border bg-muted flex items-center gap-1.5 border-b px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-red-400/70" />
        <span className="size-2.5 rounded-full bg-amber-400/70" />
        <span className="size-2.5 rounded-full bg-green-400/70" />
      </div>

      <div className="flex">
        <div className="border-border hidden w-40 shrink-0 border-r p-3 sm:block">
          <div className="bg-brand-600 mb-4 h-6 w-20 rounded" />
          {sidebarItems.map((item, index) => (
            <div
              key={item}
              className={cn(
                "mb-1 rounded px-2 py-1.5 text-[11px] font-medium",
                index === 0
                  ? "bg-brand-50 text-brand-700"
                  : "text-muted-foreground",
              )}
            >
              {item}
            </div>
          ))}
        </div>

        <div className="min-w-0 flex-1 p-4">
          <div className="text-foreground text-sm font-bold">{title}</div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="border-border rounded-lg border p-2.5">
                <div className="bg-muted h-1.5 w-8 rounded-full" />
                <div className="bg-brand-600/70 mt-2 h-3 w-10 rounded" />
              </div>
            ))}
          </div>

          <div className="border-border mt-3 rounded-lg border p-3">
            <div className="bg-muted h-1.5 w-16 rounded-full" />
            <div className="mt-3 space-y-2">
              {["w-full", "w-11/12", "w-10/12", "w-full", "w-9/12"].map(
                (width, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="bg-brand-100 size-4 shrink-0 rounded-full" />
                    <div className={cn("bg-muted h-1.5 rounded-full", width)} />
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
