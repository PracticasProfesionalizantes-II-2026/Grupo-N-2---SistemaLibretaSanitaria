"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { grantModule, revokeModule } from "@/features/erp/actions/team-actions";
import {
  DELEGABLE_MODULES,
  ERP_MODULE_LABELS,
  type DelegableModule,
  type TeamMember,
} from "@/types/erp";

/**
 * Roster de Equipo + delegación de permisos (migración 111).
 *
 * `esTitular` decide si los `Switch` quedan interactivos: quien no es
 * titular los ve igual (transparencia sobre qué puede hacer cada colega,
 * `erp-team` spec) pero deshabilitados — el RLS de la base rechazaría el
 * intento igual, pero mostrar un control que va a fallar sin explicar por
 * qué es peor que no ofrecerlo (mismo criterio que el resto del ERP con
 * `requireErp()`).
 */
export function TeamView({
  miembros,
  esTitular,
}: {
  miembros: TeamMember[];
  esTitular: boolean;
}) {
  const [roster, setRoster] = useState(miembros);
  const [pendiente, iniciarTransicion] = useTransition();

  function alternar(
    profesionalId: string,
    modulo: DelegableModule,
    otorgar: boolean,
  ) {
    // Optimista, con reversión si la acción falla: el titular puede tocar
    // varios switches seguidos sin esperar cada viaje al servidor.
    setRoster((actual) =>
      actual.map((miembro) =>
        miembro.profesionalId !== profesionalId
          ? miembro
          : {
              ...miembro,
              modulosOtorgados: otorgar
                ? [...miembro.modulosOtorgados, modulo]
                : miembro.modulosOtorgados.filter((m) => m !== modulo),
            },
      ),
    );

    iniciarTransicion(async () => {
      const resultado = await (otorgar ? grantModule : revokeModule)({
        profesionalId,
        modulo,
      });

      if (!resultado.ok) {
        toast.error(resultado.error);
        setRoster((actual) =>
          actual.map((miembro) =>
            miembro.profesionalId !== profesionalId
              ? miembro
              : {
                  ...miembro,
                  modulosOtorgados: otorgar
                    ? miembro.modulosOtorgados.filter((m) => m !== modulo)
                    : [...miembro.modulosOtorgados, modulo],
                },
          ),
        );
      }
    });
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Profesional</TH>
          <TH>Rol</TH>
          {DELEGABLE_MODULES.map((modulo) => (
            <TH key={modulo}>{ERP_MODULE_LABELS[modulo]}</TH>
          ))}
        </TR>
      </THead>
      <TBody>
        {roster.map((miembro) => (
          <TR key={miembro.profesionalId}>
            <TD>{miembro.nombre}</TD>
            <TD>
              {miembro.esTitular ? (
                <Badge variant="brand">Titular</Badge>
              ) : (
                "Profesional"
              )}
            </TD>
            {DELEGABLE_MODULES.map((modulo) => {
              const otorgado =
                miembro.esTitular || miembro.modulosOtorgados.includes(modulo);

              return (
                <TD key={modulo}>
                  <Switch
                    id={`${miembro.profesionalId}-${modulo}`}
                    label={ERP_MODULE_LABELS[modulo]}
                    checked={otorgado}
                    // El titular siempre tiene todo (104:78-89): su fila se
                    // muestra prendida pero no se puede tocar, porque no hay
                    // nada que otorgarle o revocarle a quien ya pasa por otro
                    // lado de `erp.has_access()`. Quien no es titular ve el
                    // estado real pero no puede alternarlo — `requireErpOwner()`
                    // rechazaría la acción igual; deshabilitarlo acá evita el
                    // viaje al servidor para un intento que ya se sabe que
                    // va a fallar.
                    disabled={miembro.esTitular || !esTitular || pendiente}
                    onChange={(valor) =>
                      alternar(miembro.profesionalId, modulo, valor)
                    }
                  />
                </TD>
              );
            })}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
