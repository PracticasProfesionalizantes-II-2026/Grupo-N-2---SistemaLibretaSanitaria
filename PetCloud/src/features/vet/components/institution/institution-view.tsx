"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { Controller, type Resolver, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { ImageUpload } from "@/components/ui/image-upload";
import { Input } from "@/components/ui/input";
import { LocationMap } from "@/components/ui/location-map";
import { PageHeader } from "@/components/ui/page-header";
import { AddressAutocomplete } from "@/features/vet/components/institution/address-autocomplete";
import { ProfessionalStatusChip } from "@/components/ui/status-chip";
import { Switch } from "@/components/ui/switch";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { InviteProfessionalModal } from "@/features/vet/components/institution/invite-professional-modal";
import { PendingInvitesCard } from "@/features/vet/components/institution/pending-invites-card";
import { PermissionsModal } from "@/features/vet/components/institution/permissions-modal";
import { PROFESSIONAL_PERMISSION_LABELS } from "@/config/vet-permissions";
import {
  removeProfessional,
  setAbsenceStatus,
  setOnCall,
  updateInstitution,
  updateOnCallSchedule,
  updateSchedule,
} from "@/features/vet/actions/institution-actions";
import {
  ScheduleEditor,
  defaultSchedule,
} from "@/features/onboarding/components/schedule-editor";
import {
  ABSENCE_LABELS,
  ABSENCE_STATUSES,
  type AbsenceStatus,
  DAY_LABELS,
  DAYS_OF_WEEK,
  type DayOfWeek,
  type FullSchedule,
} from "@/features/vet/schemas/schedule-schemas";
import type { OwnerTeamInvite } from "@/features/vet/data/team-invites";
import type { VetSession } from "@/features/vet/lib/vet-session";
import {
  type ClinicValues,
  clinicSchema,
} from "@/features/vet/schemas/vet-schemas";
import type { Professional } from "@/types/vet";

const ROLE_LABELS: Record<Professional["rol"], string> = {
  titular: "Titular",
  profesional: "Veterinario",
  asistente: "Recepcionista",
};

export function InstitutionView({
  institucion,
  equipoInicial,
  invitaciones,
  soyTitular,
  deGuardiaInicial,
  ausenciaInicial,
  licenciaValidada,
  accesoModulos,
}: {
  institucion: VetSession["institucion"];
  equipoInicial: Professional[];
  /** Invitaciones todavía sin responder de esta institución (058). */
  invitaciones: OwnerTeamInvite[];
  /** Solo el titular puede editar los datos; RLS lo vuelve a comprobar. */
  soyTitular: boolean;
  /** Guardia del profesional que tiene la sesión abierta, no de la institución. */
  deGuardiaInicial: boolean;
  /** Disponibilidad del profesional con la sesión abierta (071). */
  ausenciaInicial: AbsenceStatus;
  licenciaValidada: boolean;
  /**
   * La delegación de módulos del ERP, que se dibuja debajo de la tabla del
   * equipo. Llega como bloque ya armado y no como datos por dos razones.
   *
   * La primera es de frontera: el ERP lo mantiene otra persona
   * (`src/features/erp/README.md`) y esta pantalla es de PetCloud. Recibiendo
   * un `ReactNode` el archivo compartido se toca una vez y no en cada cambio
   * del roster.
   *
   * La segunda es que ese bloque necesita el corte por Premium, y ese corte
   * solo se puede hacer en el servidor: lo resuelve la página.
   */
  accesoModulos?: ReactNode;
}) {
  const router = useRouter();
  const [inviting, setInviting] = useState(false);
  const [editingPermissions, setEditingPermissions] =
    useState<Professional | null>(null);
  const [equipo, setEquipo] = useState<Professional[]>(equipoInicial);
  const [removing, setRemoving] = useState<Professional | null>(null);
  const [deGuardia, setDeGuardia] = useState(deGuardiaInicial);
  const [guardandoGuardia, setGuardandoGuardia] = useState(false);
  const [ausencia, setAusencia] = useState<AbsenceStatus>(ausenciaInicial);
  const [guardandoAusencia, setGuardandoAusencia] = useState(false);
  const ausente = ausencia !== "available";
  const sinHorarios = !("monday" in institucion.horarios);
  // Sin horarios cargados, la semana típica que muestra el editor ya es algo
  // para guardar; con horarios, recién hay algo cuando se toca un día.
  const [horarios, setHorarios] = useState<FullSchedule | null>(() =>
    sinHorarios ? defaultSchedule() : null,
  );
  const [guardandoHorarios, setGuardandoHorarios] = useState(false);
  const [diasDeGuardia, setDiasDeGuardia] = useState<DayOfWeek[]>(
    institucion.diasDeGuardia,
  );
  const [guardandoDias, setGuardandoDias] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ClinicValues>({
    // El schema acepta `""` en `latitud`/`longitud` a la entrada (así llega
    // un input numérico vacío) y devuelve `number | undefined` a la salida:
    // ese desfase input/output es exactamente lo que `zodResolver` valida en
    // runtime, pero `useForm<T>` de RHF pide un único tipo para las dos
    // puntas. El cast documenta la asimetría en vez de esconderla detrás de
    // una generación de tipos más compleja para un solo formulario.
    resolver: zodResolver(clinicSchema) as Resolver<ClinicValues>,
    defaultValues: {
      nombre: institucion.nombre,
      direccion: institucion.direccion,
      telefono: institucion.telefono,
      web: institucion.web,
      latitud: institucion.latitud,
      longitud: institucion.longitud,
    },
  });

  /**
   * De dónde salieron las coordenadas que tiene el formulario: las guardadas
   * o la última sugerencia elegida. Valen solo mientras el texto sea el mismo
   * que les dio origen; si la persona lo edita a mano ya no describen esa
   * dirección, y guardarlas pondría el pin en otro lado. Volver al texto
   * exacto las recupera.
   */
  const [origenCoords, setOrigenCoords] = useState(() =>
    institucion.latitud !== undefined && institucion.longitud !== undefined
      ? {
          label: institucion.direccion,
          lat: institucion.latitud,
          lng: institucion.longitud,
        }
      : null,
  );
  const latitud = useWatch({ control, name: "latitud" });
  const longitud = useWatch({ control, name: "longitud" });
  const direccion = useWatch({ control, name: "direccion" });
  const tieneCoords = latitud !== undefined && longitud !== undefined;

  function ponerCoords(coords: { lat: number; lng: number } | null) {
    setValue("latitud", coords?.lat);
    setValue("longitud", coords?.lng);
  }

  const onSubmit = handleSubmit(async (values) => {
    const result = await updateInstitution(values);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("Datos de la institución actualizados.");
  });

  /**
   * El interruptor nunca queda prendido en pantalla si la base lo apagó.
   *
   * `protect_vet_privileges()` (055) revierte `on_call` a `false` en
   * silencio cuando la matrícula no está validada: el `UPDATE` "tiene
   * éxito" (no tira error), pero la fila real queda apagada. Por eso acá se
   * confía en `resultado.onCall` — lo que la base realmente guardó tras
   * releer la fila — y nunca en el valor optimista que se mandó a togglear.
   */
  async function handleToggleGuardia(activo: boolean) {
    setGuardandoGuardia(true);
    const resultado = await setOnCall(activo);
    setGuardandoGuardia(false);

    if (!resultado.success) {
      toast.error(resultado.error);
      return;
    }

    setDeGuardia(resultado.onCall);

    if (activo && !resultado.onCall) {
      toast.error(
        "No pudimos prenderla: tu matrícula todavía está en revisión.",
      );
      return;
    }

    // El directorio solo lista clínicas con coordenadas guardadas: sin ellas,
    // decir "aparecés" sería mentir. Se mira lo guardado, no el formulario.
    const sinUbicacion =
      institucion.latitud === undefined || institucion.longitud === undefined;

    toast.success(
      !resultado.onCall
        ? "Ya no aparecés como de guardia."
        : sinUbicacion
          ? "Estás de guardia. Para que los dueños te vean en el directorio, elegí la dirección de la clínica entre las sugerencias."
          : "Aparecés como de guardia en el directorio.",
    );
  }

  async function handleSaveSchedule() {
    if (!horarios) return;

    setGuardandoHorarios(true);
    const result = await updateSchedule(horarios);
    setGuardandoHorarios(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    setHorarios(null);
    toast.success("Horarios de atención actualizados.");
  }

  /**
   * Cada tilde guarda en el momento, como el interruptor de guardia: son siete
   * casillas y un botón aparte para confirmarlas sería una fricción de más.
   * Si falla, la casilla vuelve a como estaba.
   */
  async function handleToggleDia(dia: DayOfWeek, marcado: boolean) {
    const anterior = diasDeGuardia;
    const siguiente = DAYS_OF_WEEK.filter((d) =>
      d === dia ? marcado : anterior.includes(d),
    );

    setDiasDeGuardia(siguiente);
    setGuardandoDias(true);
    const result = await updateOnCallSchedule(siguiente);
    setGuardandoDias(false);

    if (!result.success) {
      setDiasDeGuardia(anterior);
      toast.error(result.error);
    }
  }

  /**
   * Marcarse ausente con la guardia prendida la apaga en la base (071); la
   * pantalla toma el `on_call` releído, nunca el que tenía antes.
   */
  async function handleAusencia(estado: AbsenceStatus) {
    if (estado === ausencia) return;

    setGuardandoAusencia(true);
    const resultado = await setAbsenceStatus(estado);
    setGuardandoAusencia(false);

    if (!resultado.success) {
      toast.error(resultado.error);
      return;
    }

    const apagoLaGuardia = deGuardia && !resultado.onCall;
    setAusencia(resultado.absenceStatus);
    setDeGuardia(resultado.onCall);

    toast.success(
      apagoLaGuardia
        ? "Listo. Como no estás disponible, se apagó tu guardia."
        : "Listo, actualizamos tu disponibilidad.",
    );
  }

  const pending = equipo.filter(
    (professional) => professional.estado === "matricula-pendiente",
  );

  /**
   * Dar de baja a alguien del equipo saca su acceso al panel, nada más. Las
   * consultas y vacunaciones que firmó quedan en la historia clínica de cada
   * mascota: son actos sanitarios con matrícula detrás y el municipio los
   * consulta. Borrarlos dejaría libretas con huecos.
   *
   * Llama a `removeProfessional()` (wrapper de `revoke_vet_team_member()`,
   * 058) de verdad: antes de este cambio el botón solo filtraba la lista en
   * memoria y nunca tocaba la base, el mismo tipo de guardado fingido que
   * tenía `permissions-modal.tsx` hasta que la fase 3 lo corrigió del otro
   * lado — ahí no se cambió la escritura, se sacó: el modal pasó a ser de
   * solo lectura.
   */
  async function handleRemove() {
    if (!removing) return;

    const result = await removeProfessional(removing.id);

    if (!result.success) {
      toast.error(result.error);
      setRemoving(null);
      return;
    }

    setEquipo((prev) => prev.filter((item) => item.id !== removing.id));
    toast.success(`${removing.nombre} ya no tiene acceso al panel.`);
    setRemoving(null);
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Institución"
        description="Datos de la veterinaria, equipo y permisos."
        breadcrumbs={[
          { label: "Gestión", href: "/veterinaria/gestion" },
          { label: "Institución" },
        ]}
      />

      <div className="space-y-6">
        <Card className="p-5">
          <h2 className="text-foreground font-semibold">
            Datos de la veterinaria
          </h2>

          <form noValidate onSubmit={onSubmit} className="mt-5 space-y-5">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <ImageUpload
                label="Logo"
                rounded="lg"
                hint="PNG o JPG, hasta 2 MB."
              />

              <div className="flex-1 space-y-4">
                <Field
                  label="Nombre"
                  htmlFor="nombre-clinica"
                  error={errors.nombre?.message}
                  required
                >
                  <Input id="nombre-clinica" {...register("nombre")} />
                </Field>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    label="Dirección"
                    htmlFor="direccion-clinica"
                    error={errors.direccion?.message}
                    required
                  >
                    <Controller
                      control={control}
                      name="direccion"
                      render={({ field }) => (
                        <AddressAutocomplete
                          id="direccion-clinica"
                          value={field.value}
                          invalid={Boolean(errors.direccion)}
                          onChange={(texto) => {
                            field.onChange(texto);
                            ponerCoords(
                              origenCoords && texto === origenCoords.label
                                ? origenCoords
                                : null,
                            );
                          }}
                          onSelect={(sugerencia) => {
                            field.onChange(sugerencia.label);
                            setOrigenCoords(sugerencia);
                            ponerCoords(sugerencia);
                          }}
                        />
                      )}
                    />
                    {/*
                      Las coordenadas no se escriben: salen de elegir una
                      sugerencia. Es un aviso y no un error, porque sin Photon
                      la dirección tiene que poder guardarse igual.
                    */}
                    {direccion.trim() && !tieneCoords ? (
                      <p className="text-warning mt-1.5 text-xs">
                        Elegí una de las sugerencias para aparecer en el
                        directorio de veterinarias cercanas.
                      </p>
                    ) : null}
                  </Field>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Teléfono"
                htmlFor="telefono-clinica"
                error={errors.telefono?.message}
                required
              >
                <Input id="telefono-clinica" {...register("telefono")} />
              </Field>

              <Field label="Sitio web" htmlFor="web-clinica" hint="Opcional">
                <Input id="web-clinica" {...register("web")} />
              </Field>
            </div>

            {/*
              Sin coordenadas no hay nada que mostrar acá: el aviso debajo de
              Dirección ya dice qué falta. Con coordenadas, el mapa muestra las
              del formulario —no las guardadas—, así elegir otra sugerencia
              se ve antes de guardar.
            */}
            {tieneCoords ? (
              <div>
                <h3 className="text-foreground mb-2 text-sm font-semibold">
                  Ubicación
                </h3>
                <LocationMap lat={latitud} lng={longitud} address={direccion} />
              </div>
            ) : null}

            <div className="flex justify-end">
              {/*
                RLS deja editar solo al titular. Sin esto el botón invita a
                escribir para después fallar, que es la peor forma de enterarse.
              */}
              <Button type="submit" disabled={isSubmitting || !soyTitular}>
                {isSubmitting ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </form>
        </Card>

        <Card className="p-5">
          {/*
            Visible para cualquier rol, a diferencia de los datos de arriba:
            cada profesional prende o apaga su propia fila, nunca la de otro
            (001:251-254). Que el titular tenga que serlo para ver "de
            guardia" no tendría sentido — es un dato de cada persona, no de
            la institución.
          */}
          <div>
            <h2 className="text-foreground font-semibold">Mi disponibilidad</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Es tuya: no cambia la de tus colegas.
            </p>
            <div
              role="radiogroup"
              aria-label="Mi disponibilidad"
              className="border-border mt-3 inline-flex flex-wrap rounded-lg border p-1"
            >
              {ABSENCE_STATUSES.map((estado) => (
                <button
                  key={estado}
                  type="button"
                  role="radio"
                  aria-checked={ausencia === estado}
                  onClick={() => handleAusencia(estado)}
                  disabled={guardandoAusencia}
                  className={
                    ausencia === estado
                      ? "bg-brand-600 rounded-md px-3 py-1.5 text-sm font-semibold text-white"
                      : "text-muted-foreground hover:bg-muted rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-60"
                  }
                >
                  {ABSENCE_LABELS[estado]}
                </button>
              ))}
            </div>
          </div>

          {/*
            Deshabilitado mientras esté ausente, con el motivo a la vista. La
            guarda de verdad es `protect_vet_privileges()` (071): aunque se
            forzara el pedido, la base deja la guardia apagada.
          */}
          <div className="border-border mt-5 border-t pt-5">
            <Switch
              id="guardia-propia"
              checked={deGuardia}
              onChange={handleToggleGuardia}
              disabled={guardandoGuardia || ausente}
              label="Estoy de guardia"
              description={
                ausente
                  ? `Figurás como "${ABSENCE_LABELS[ausencia]}": para ponerte de guardia, primero marcate como disponible.`
                  : licenciaValidada
                    ? "Aparecés en el directorio de dueños como veterinario de guardia de esta clínica."
                    : "Tu matrícula todavía está en revisión: no podés aparecer de guardia hasta que PetCloud la valide."
              }
            />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-foreground font-semibold">Guardia programada</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Los días en que la veterinaria hace guardia. Ese día aparece de
            guardia en el directorio aunque nadie tenga el interruptor prendido.
            {soyTitular ? null : " Solo el titular los puede cambiar."}
          </p>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3">
            {DAYS_OF_WEEK.map((dia) => (
              <label
                key={dia}
                className="text-foreground flex items-center gap-2 text-sm"
              >
                <Checkbox
                  checked={diasDeGuardia.includes(dia)}
                  onChange={(e) => handleToggleDia(dia, e.target.checked)}
                  disabled={!soyTitular || guardandoDias}
                  className="mt-0"
                />
                {DAY_LABELS[dia]}
              </label>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-foreground font-semibold">
            Horarios de atención
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Definen en qué franjas la veterinaria recibe mascotas.
          </p>

          {sinHorarios ? (
            <p className="text-muted-foreground mt-3 text-sm">
              Todavía no cargaste los horarios: abajo tenés una semana típica
              para ajustar.
            </p>
          ) : null}

          {/* Solo el titular los edita (005); el resto los ve. */}
          <div className="mt-4">
            <ScheduleEditor
              initialSchedule={institucion.horarios}
              onChange={setHorarios}
              disabled={!soyTitular}
            />
          </div>

          <div className="mt-4 flex justify-end">
            <Button
              onClick={handleSaveSchedule}
              disabled={!soyTitular || guardandoHorarios || horarios === null}
            >
              {guardandoHorarios ? "Guardando..." : "Guardar horarios"}
            </Button>
          </div>

          <p className="text-muted-foreground mt-4 text-sm">
            Estado:{" "}
            <strong>
              {institucion.validada
                ? "validada por PetCloud"
                : "pendiente de validación"}
            </strong>
          </p>
        </Card>

        {pending.length > 0 ? (
          <Alert variant="warning">
            <strong>
              {pending.length} matrícula{pending.length === 1 ? "" : "s"} en
              validación.
            </strong>{" "}
            PetCloud verifica los datos con el colegio profesional. Hasta que
            termine, {pending.map((item) => item.nombre).join(", ")} puede
            cargar atenciones pero no firmarlas.
          </Alert>
        ) : null}

        <Card className="p-0">
          <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b p-5">
            <div>
              <h2 className="text-foreground font-semibold">
                Profesionales del equipo
              </h2>
              <p className="text-muted-foreground mt-0.5 text-sm">
                {equipo.length} personas con acceso al panel.
              </p>
            </div>
            <Button size="sm" onClick={() => setInviting(true)}>
              <UserPlus className="size-4" />
              Invitar profesional
            </Button>
          </div>

          <div className="p-5">
            <Table>
              <THead>
                <tr>
                  <TH>Nombre</TH>
                  <TH>Matrícula</TH>
                  <TH>Especialidad</TH>
                  <TH>Estado</TH>
                  <TH>Permisos</TH>
                  <TH className="text-right">Acciones</TH>
                </tr>
              </THead>
              <TBody>
                {equipo.map((professional) => (
                  <TR key={professional.id}>
                    {/* El rol va acá abajo y no en su propia columna: una columna
                        más empujaba "Editar permisos" fuera del ancho visible. */}
                    <TD>
                      <span className="text-foreground block font-medium">
                        {professional.nombre}
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        {ROLE_LABELS[professional.rol]}
                      </span>
                    </TD>
                    <TD className="text-muted-foreground">
                      {professional.matricula}
                    </TD>
                    <TD className="text-muted-foreground">
                      {professional.especialidad}
                    </TD>
                    <TD>
                      <ProfessionalStatusChip status={professional.estado} />
                    </TD>
                    {/* Resumido con la lista completa en el `title`: desplegarla
                        en la celda hacía crecer la tabla más que el contenedor. */}
                    <TD className="text-muted-foreground text-sm">
                      <span
                        title={professional.permisos
                          .map(
                            (permission) =>
                              PROFESSIONAL_PERMISSION_LABELS[permission],
                          )
                          .join(", ")}
                      >
                        {professional.permisos.length} de{" "}
                        {Object.keys(PROFESSIONAL_PERMISSION_LABELS).length}
                      </span>
                    </TD>
                    <TD>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingPermissions(professional)}
                          className="text-brand-700 hover:bg-muted rounded-lg px-2.5 py-1.5 text-sm font-medium"
                        >
                          Ver permisos
                        </button>

                        {/* El titular no se puede eliminar: es quien responde
                            por la institución ante el municipio, y sin él la
                            veterinaria quedaría sin nadie con acceso total. */}
                        <button
                          type="button"
                          onClick={() => setRemoving(professional)}
                          disabled={professional.rol === "titular"}
                          title={
                            professional.rol === "titular"
                              ? "El titular de la veterinaria no se puede eliminar"
                              : `Eliminar a ${professional.nombre}`
                          }
                          aria-label={`Eliminar a ${professional.nombre}`}
                          className="text-muted-foreground hover:bg-danger/10 hover:text-danger flex size-8 items-center justify-center rounded-lg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>

        <PendingInvitesCard invitaciones={invitaciones} />

        {/*
          Los módulos del ERP se delegan en su propia tarjeta, debajo de la
          tabla de arriba y no adentro de ella, aunque las dos hablen de las
          mismas personas.

          La razón es que las dos columnas de permisos no valen lo mismo. Los
          módulos del ERP son reales: `grantModule`/`revokeModule` escriben en
          `erp.module_grants` y RLS hace cumplir el resultado (migraciones 104
          y 111). Los permisos de panel de la tabla de arriba, en cambio, no
          se pueden tocar por persona todavía — los define el rol — así que `permissions-modal.tsx`
          (fase 3 de `vet-team-invitations`) dejó de fingir que guarda: ahora
          es de solo lectura y lo dice en pantalla.

          Mezclar en una misma fila un control que guarda con otro que solo
          explica sigue siendo peor que dos tarjetas: nadie podría saber,
          mirando la pantalla, cuál de los dos hace algo al tocarlo. Si algún
          día los permisos de panel se vuelven finos por persona, ahí tiene
          sentido discutir si se funden.
        */}
        {accesoModulos}

        <Card className="p-5">
          <h2 className="text-foreground flex items-center gap-2 font-semibold">
            <ShieldCheck className="text-success size-5" />
            Validación de matrículas
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Cada matrícula la verifica PetCloud contra el colegio profesional
            correspondiente. Solo un profesional con matrícula validada puede
            firmar consultas, vacunaciones y certificados: es lo que hace que el
            registro tenga valor sanitario para el municipio.
          </p>
        </Card>
      </div>

      <InviteProfessionalModal
        open={inviting}
        onClose={() => setInviting(false)}
        onInvited={() => router.refresh()}
      />

      {/* `key` remonta el modal por profesional para arrancar con sus permisos. */}
      <PermissionsModal
        key={editingPermissions?.id}
        professional={editingPermissions}
        onClose={() => setEditingPermissions(null)}
      />

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={handleRemove}
        title={`¿Eliminar a ${removing?.nombre ?? ""} del equipo?`}
        description={`Pierde el acceso al panel de ${institucion.nombre} y deja de aparecer como profesional de la institución. Las consultas y vacunaciones que ya firmó siguen en la historia clínica de cada mascota: son actos con matrícula y no se borran. Si vuelve a trabajar acá, se lo invita de nuevo.`}
        confirmLabel="Eliminar del equipo"
      />
    </div>
  );
}
