import { Card } from "@/components/ui/card";

/**
 * Fallback skeleton for every `/admin` route without its own `loading.tsx`.
 * Most admin sections are a page header plus a table or list, so that is the
 * shape it reserves.
 */
export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-label="Cargando">
      <div className="mb-6 space-y-2">
        <div className="bg-muted h-8 w-48 animate-pulse rounded" />
        <div className="bg-muted h-4 w-80 max-w-full animate-pulse rounded" />
      </div>

      <Card className="p-0">
        <div className="border-border flex items-center justify-between gap-4 border-b p-4">
          <div className="bg-muted h-9 w-64 max-w-full animate-pulse rounded-lg" />
          <div className="bg-muted h-9 w-28 animate-pulse rounded-lg" />
        </div>

        <ul className="divide-border divide-y">
          {Array.from({ length: 6 }, (_, index) => (
            <li key={index} className="flex items-center gap-4 p-4">
              <div className="bg-muted size-9 shrink-0 animate-pulse rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="bg-muted h-4 w-1/3 animate-pulse rounded" />
                <div className="bg-muted h-3 w-1/2 animate-pulse rounded" />
              </div>
              <div className="bg-muted hidden h-6 w-20 animate-pulse rounded-full sm:block" />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
