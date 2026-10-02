import { AlertTriangle, Info } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { VetNotice, VetNoticeType } from "@/types/vet";

const NOTICE_STYLE: Record<
  VetNoticeType,
  { icon: typeof Info; className: string }
> = {
  vencimiento: {
    icon: AlertTriangle,
    className: "bg-warning-soft text-warning",
  },
  sistema: { icon: Info, className: "bg-info-soft text-info" },
};

export function VetNotices({ notices }: { notices: VetNotice[] }) {
  return (
    <Card className="p-0">
      <div className="border-border border-b p-5">
        <h2 className="text-foreground font-semibold">Avisos</h2>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Vacunas por vencer de los pacientes de la casa.
        </p>
      </div>

      {notices.length === 0 ? (
        <div className="p-5">
          <EmptyState
            icon={Info}
            title="Sin pendientes"
            description="Cuando a un paciente de la casa se le acerque el vencimiento de una vacuna, va a aparecer acá."
          />
        </div>
      ) : (
        <ul className="divide-border divide-y">
          {notices.map((notice) => {
            const style = NOTICE_STYLE[notice.tipo];

            return (
              <li key={notice.id}>
                <Link
                  href={notice.href}
                  className="hover:bg-muted flex gap-3 p-4"
                >
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${style.className}`}
                  >
                    <style.icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="text-foreground block text-sm font-medium">
                      {notice.titulo}
                    </span>
                    <span className="text-muted-foreground mt-0.5 block text-sm">
                      {notice.detalle}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
