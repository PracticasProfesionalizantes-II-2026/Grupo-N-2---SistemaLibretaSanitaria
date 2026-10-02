import { PawPrint, QrCode, UserPlus } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { VET_BASE } from "@/config/vet-nav";

/**
 * Accesos rápidos del mostrador. Todo arranca identificando a la mascota, por
 * eso el escáner está primero y las altas y llegadas cuelgan de ahí.
 */
const ACTIONS = [
  {
    label: "Escanear QR",
    detalle: "Identificar una mascota con el QR de su collar",
    href: `${VET_BASE}/escanear`,
    icon: QrCode,
  },
  {
    label: "Registrar llegada",
    detalle: "Sumar una mascota a la cola de atención",
    href: `${VET_BASE}/sala-de-espera`,
    icon: UserPlus,
  },
  {
    label: "Nuevo paciente",
    detalle: "Dar de alta una mascota que no está en PetCloud",
    href: `${VET_BASE}/pacientes?alta=1`,
    icon: PawPrint,
  },
];

export function VetQuickActions() {
  return (
    <div>
      <h2 className="text-foreground mb-3 font-semibold">Accesos rápidos</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ACTIONS.map((action) => (
          <Link key={action.href} href={action.href} className="block">
            <Card className="hover:border-brand-300 h-full p-4 transition-colors">
              <span className="bg-brand-50 text-brand-700 flex size-10 items-center justify-center rounded-lg">
                <action.icon className="size-5" />
              </span>
              <p className="text-foreground mt-3 text-sm font-semibold">
                {action.label}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {action.detalle}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
