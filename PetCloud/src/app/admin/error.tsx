"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Fallback error boundary for every `/admin` route without its own
 * `error.tsx`. It renders inside `admin/layout.tsx`, so the navigation stays
 * usable. `retry` re-fetches the segment on the server; `reset` would only
 * re-render the same failed data.
 */
export default function AdminError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card className="mx-auto mt-10 max-w-lg p-6 text-center" role="alert">
      <AlertTriangle className="text-danger mx-auto size-8" />
      <h1 className="text-foreground mt-3 text-lg font-semibold">
        No se pudo cargar esta sección
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Falló la lectura de datos. Probá de nuevo en unos segundos.
      </p>
      {error.digest ? (
        <p className="text-muted-foreground mt-2 font-mono text-xs">
          Ref: {error.digest}
        </p>
      ) : null}
      <Button className="mt-5" onClick={() => retry()}>
        Reintentar
      </Button>
    </Card>
  );
}
