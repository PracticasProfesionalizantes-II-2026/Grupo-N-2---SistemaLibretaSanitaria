"use client";

import type { ReactNode } from "react";

import {
  Bug,
  CalendarDays,
  HeartPulse,
  PawPrint,
  Pill,
  QrCode,
  Scale,
  Stethoscope,
  Syringe,
} from "lucide-react";

import { useActivePet } from "@/features/owner/components/active-pet-provider";
import { BirthdayBanner } from "@/features/owner/components/birthday-banner";
import { CompleteAddressBanner } from "@/features/owner/components/complete-address-banner";
import { PetSummaryCard } from "@/features/owner/components/dashboard/pet-summary-card";
import { QuickAccessGrid } from "@/features/owner/components/dashboard/quick-access-grid";
import { useNewPetDialog } from "@/features/owner/components/pets/new-pet-dialog-provider";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useSessionUser } from "@/features/auth/components/session-provider";

/**
 * La columna lateral llega como `aside` y no se importa acá.
 *
 * Esta vista es cliente —usa la mascota activa del topbar— y la columna consulta
 * la base. Un componente de servidor no se puede importar desde uno de cliente:
 * el bundler lo arrastraría al navegador junto con todo el acceso a datos. Se
 * renderiza en la página y entra por prop, ya resuelto.
 */
export function DashboardView({
  aside,
  turnos,
  invitaciones,
}: {
  aside?: ReactNode;
  /**
   * El widget de próximos turnos, ya renderizado en el servidor. Entra como
   * `ReactNode` y no como datos por el mismo motivo que `aside`: esta vista es
   * cliente y no puede consultar la base. El widget devuelve `null` cuando no
   * hay turnos, así que acá no hace falta condicionar nada.
   */
  turnos?: ReactNode;
  /**
   * Invitaciones a coadministrar pendientes, ya renderizadas. Van en los dos
   * estados (con y sin mascotas): una cuenta nueva invitada por otro dueño es
   * justo quien más la necesita ver.
   */
  invitaciones?: ReactNode;
}) {
  const { activePet, pets } = useActivePet();
  const abrirAlta = useNewPetDialog();
  const user = useSessionUser();
  const nombreCompleto = user ? `${user.nombre} ${user.apellido}`.trim() : "";

  // Cuenta recién creada: no hay resumen que mostrar todavía, y llenar la
  // pantalla de tarjetas vacías haría parecer que algo se rompió.
  if (!activePet) {
    return (
      <div>
        <CompleteAddressBanner />
        <h1 className="text-foreground text-2xl font-bold tracking-tight">
          Hola{nombreCompleto ? `, ${nombreCompleto}` : ""}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Bienvenido a PetCloud. Empecemos por tu primera mascota.
        </p>

        {invitaciones ? (
          <div className="mt-6 max-w-lg">{invitaciones}</div>
        ) : null}

        <div className="mt-8 max-w-lg">
          <EmptyState
            icon={PawPrint}
            title="Todavía no cargaste ninguna mascota"
            description="Cargá a tu mascota y vas a tener su libreta sanitaria completa: vacunas, historial, peso y un collar con QR para que puedan devolvértela si se pierde."
            action={
              <Button onClick={abrirAlta}>Cargar mi primera mascota</Button>
            }
          />
        </div>
      </div>
    );
  }

  const petBase = `/mascotas/${activePet.id}`;

  const gestion = [
    { label: "Peso", href: `${petBase}/peso`, icon: Scale },
    {
      label: "Historial médico",
      href: `${petBase}/historial`,
      icon: Stethoscope,
    },
    { label: "Recordatorios", href: "/recordatorios", icon: CalendarDays },
    { label: "Collar / QR", href: `${petBase}/qr`, icon: QrCode },
    { label: "Visitas", href: "/visitas", icon: Stethoscope },
  ];

  const salud = [
    { label: "Vacunas", href: `${petBase}/vacunas`, icon: Syringe },
    {
      label: "Antiparasitarios",
      href: `${petBase}/antiparasitarios`,
      icon: Bug,
    },
    { label: "Medicamentos", href: `${petBase}/medicamentos`, icon: Pill },
    {
      label: "Enfermedades y alergias",
      href: `${petBase}/enfermedades`,
      icon: HeartPulse,
    },
  ];

  return (
    <div>
      <CompleteAddressBanner />
      <BirthdayBanner pets={pets} />
      <div className="mb-6">
        <h1 className="text-foreground text-2xl font-bold tracking-tight">
          Hola{nombreCompleto ? `, ${nombreCompleto}` : ""}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Este es el resumen de {activePet.nombre}. Cambiá de mascota desde el
          selector de arriba.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {/* Arriba de la campaña y del resumen: es el dato con fecha de
              vencimiento, y el único de esta pantalla que sirve para no
              faltar a algo. */}
          {invitaciones}
          {turnos}
          <PetSummaryCard pet={activePet} />
          <QuickAccessGrid title="Gestión" items={gestion} />
          <QuickAccessGrid title="Herramientas de salud" items={salud} />
        </div>

        {aside}
      </div>
    </div>
  );
}
