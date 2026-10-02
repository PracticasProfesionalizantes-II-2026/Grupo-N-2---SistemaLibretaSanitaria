"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PartyPopper } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { ImageUpload } from "@/components/ui/image-upload";
import { Input } from "@/components/ui/input";
import { QrPlaceholder } from "@/components/ui/qr-placeholder";
import { Select } from "@/components/ui/select";
import { Stepper } from "@/components/ui/stepper";
import { ApproximateAgeInput } from "@/features/owner/components/pets/approximate-age-input";
import { PendingInvitesList } from "@/features/owner/components/invites/pending-invites-list";
import { createPet } from "@/features/owner/actions/pets-actions";
import { getPostLoginRoute } from "@/config/roles";
import {
  type PetBasicsFormValues,
  petBasicsSchema,
} from "@/features/onboarding/schemas/onboarding-schemas";
import { breedsBySpecies } from "@/features/owner/schemas/pet-schema";
import type { PendingPetInvite } from "@/features/owner/data/owner-queries";

const STEPS = ["Datos básicos", "Foto", "Listo"];

export function OwnerOnboardingWizard({
  invitaciones,
}: {
  /**
   * Invitaciones pendientes dirigidas al email ya confirmado de quien se
   * está registrando (`listMyPendingPetInvites()`, resuelta también por la
   * página del servidor). Vacío es el caso de siempre: cae directo al alta
   * de mascota, sin ningún cambio de comportamiento.
   */
  invitaciones: PendingPetInvite[];
}) {
  const router = useRouter();
  // Los pasos van de 2 a 4 (el 1 era el municipio, que ya no existe).
  const [step, setStep] = useState(2);
  const [pet, setPet] = useState<PetBasicsFormValues>();

  // Estado propio del paso 2: qué invitaciones quedan sin resolver y si la
  // persona pidió explícitamente ver el alta de mascota en su lugar. Son dos
  // cosas distintas — la lista puede quedar vacía sola (se aceptaron/
  // rechazaron todas) o la persona puede pedir el formulario mientras todavía
  // le quedan invitaciones pendientes (tarea 3.2: "cargar una mascota nueva"
  // sigue disponible aunque haya invitaciones sin resolver).
  const [invitacionesPendientes, setInvitacionesPendientes] =
    useState(invitaciones);
  const [verFormularioMascota, setVerFormularioMascota] = useState(
    invitaciones.length === 0,
  );
  const mostrarInvitaciones =
    invitacionesPendientes.length > 0 && !verFormularioMascota;

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PetBasicsFormValues>({ resolver: zodResolver(petBasicsSchema) });
  const [fechaAproximada, setFechaAproximada] = useState(false);

  // Las razas dependen de la especie elegida. A diferencia de los otros
  // formularios de alta (pet-form-modal, new-patient-modal,
  // register-pet-modal), acá no hay default a la lista de "perro": mientras no
  // haya especie no existe una lista correcta que ofrecer, y proponer razas de
  // perro a quien todavía no eligió invita a cargar un dato equivocado. Por eso
  // el selector queda deshabilitado con un texto que explica qué falta.
  const especie = useWatch({ control, name: "especie" });
  const breeds = especie ? (breedsBySpecies[especie] ?? []) : [];

  const [error, setError] = useState<string>();

  const onSubmitBasics = handleSubmit(async (values) => {
    setError(undefined);

    const result = await createPet(values);
    if (!result.success) {
      setError(result.error);
      return;
    }

    setPet(values);
    setStep(3);
  });

  /** "Terminar sin cargar una mascota": salta derecho al paso final. */
  function onSkipPet() {
    setError(undefined);
    setStep(4);
  }

  return (
    <Card className="w-full max-w-xl">
      <Stepper steps={STEPS} current={step - 1} />

      {step === 2 ? (
        mostrarInvitaciones ? (
          <>
            <h1 className="text-foreground mt-6 text-xl font-bold">
              Tenés invitaciones pendientes
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Alguien ya compartió una mascota con vos. Podés aceptar o rechazar
              cada invitación por separado.
            </p>

            <div className="mt-6">
              <PendingInvitesList
                invitaciones={invitacionesPendientes}
                onChange={setInvitacionesPendientes}
              />
            </div>

            {/* Fallback explícito (tarea 3.2): quien tiene invitaciones
                pendientes también puede querer cargar su propia mascota, sin
                tener que resolver primero todas las que le llegaron. */}
            <button
              type="button"
              onClick={() => setVerFormularioMascota(true)}
              className="text-brand-600 mt-6 block w-full text-center text-sm font-medium hover:underline"
            >
              Prefiero cargar una mascota nueva
            </button>
          </>
        ) : (
          <>
            <h1 className="text-foreground mt-6 text-xl font-bold">
              Cargá tu primera mascota
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Con estos datos ya generamos su perfil digital y su código QR.
            </p>

            {error ? (
              <div className="mt-4">
                <Alert variant="danger">{error}</Alert>
              </div>
            ) : null}

            <form
              noValidate
              onSubmit={onSubmitBasics}
              className="mt-6 space-y-5"
            >
              <Field
                label="Nombre"
                htmlFor="nombre"
                error={errors.nombre?.message}
                required
              >
                <Input id="nombre" {...register("nombre")} />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="Especie"
                  htmlFor="especie"
                  error={errors.especie?.message}
                  required
                >
                  <Select
                    id="especie"
                    defaultValue=""
                    {...register("especie", {
                      // Cambiar de especie deja huérfana la raza ya elegida
                      // ("Siamés" no existe entre las razas de perro), así que
                      // se limpia el campo en vez de guardar una combinación
                      // imposible. Los otros formularios no contemplan este
                      // caso; acá se resuelve porque el select nuevo lo expone.
                      onChange: () => setValue("raza", ""),
                    })}
                  >
                    <option value="" disabled>
                      Elegí una opción
                    </option>
                    <option value="perro">Perro</option>
                    <option value="gato">Gato</option>
                    <option value="otro">Otro</option>
                  </Select>
                </Field>

                <Field
                  label="Raza"
                  htmlFor="raza"
                  hint="Opcional"
                  error={errors.raza?.message}
                >
                  <Select
                    id="raza"
                    defaultValue=""
                    disabled={!especie}
                    {...register("raza")}
                  >
                    <option value="">
                      {especie ? "Sin especificar" : "Elegí primero la especie"}
                    </option>
                    {breeds.map((breed) => (
                      <option key={breed} value={breed}>
                        {breed}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="Sexo"
                  htmlFor="sexo"
                  error={errors.sexo?.message}
                  required
                >
                  <Select id="sexo" defaultValue="" {...register("sexo")}>
                    <option value="" disabled>
                      Elegí una opción
                    </option>
                    <option value="macho">Macho</option>
                    <option value="hembra">Hembra</option>
                  </Select>
                </Field>

                <Field
                  label="Fecha de nacimiento"
                  htmlFor="fechaNacimiento"
                  error={errors.fechaNacimiento?.message}
                  hint={
                    fechaAproximada
                      ? "Calculamos una fecha aproximada a partir de la edad."
                      : undefined
                  }
                  required
                >
                  {fechaAproximada ? (
                    <ApproximateAgeInput
                      onFecha={(fecha) =>
                        setValue("fechaNacimiento", fecha, {
                          shouldValidate: Boolean(fecha),
                        })
                      }
                    />
                  ) : (
                    <Input
                      id="fechaNacimiento"
                      type="date"
                      {...register("fechaNacimiento")}
                    />
                  )}
                  <label className="text-muted-foreground mt-2 flex items-center gap-2 text-xs">
                    <Checkbox
                      className="mt-0"
                      checked={fechaAproximada}
                      onChange={(e) => {
                        setFechaAproximada(e.target.checked);
                        setValue("fechaNacimiento", "");
                      }}
                    />
                    No sé la fecha exacta
                  </label>
                </Field>
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Guardando..." : "Continuar"}
              </Button>
            </form>

            {/* Siempre disponible (tarea 3.2 / spec "Skipping Pet Creation Is
                Always Available"): con invitaciones, sin ellas, o habiéndolas
                rechazado todas — nunca la única salida es cargar una
                mascota. */}
            <button
              type="button"
              onClick={onSkipPet}
              disabled={isSubmitting}
              className="text-muted-foreground hover:text-foreground mt-4 block w-full text-center text-sm font-medium disabled:opacity-50"
            >
              Terminar sin cargar una mascota
            </button>
          </>
        )
      ) : null}

      {step === 3 ? (
        <>
          <h1 className="text-foreground mt-6 text-xl font-bold">
            Agregá una foto de {pet?.nombre}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Ayuda a identificarla rápido si alguna vez se pierde.
          </p>

          <div className="mt-8">
            <ImageUpload
              label="Subir foto"
              hint="JPG o PNG, hasta 5 MB. Podés agregarla más tarde."
            />
          </div>

          <div className="mt-8 flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setStep(2)}
            >
              Atrás
            </Button>
            <Button className="flex-1" onClick={() => setStep(4)}>
              Continuar
            </Button>
          </div>
        </>
      ) : null}

      {step === 4 ? (
        <div className="mt-6 text-center">
          <span className="bg-brand-50 text-brand-700 mx-auto flex size-14 items-center justify-center rounded-full">
            <PartyPopper className="size-6" />
          </span>
          {/*
           * Variante sin mascota: cubre tanto a quien tocó "Terminar sin
           * cargar una mascota" como a quien solo aceptó invitaciones y
           * nunca pasó por `onSubmitBasics` — en los dos casos `pet` sigue
           * `undefined`, porque esa variable solo se llena cuando ESTA
           * sesión creó su propia mascota (`setPet(values)` en
           * `onSubmitBasics`), nunca por aceptar el acceso a la de otro
           * dueño. Sin esta rama, `{pet?.nombre}` renderizaba literalmente
           * vacío y el bloque de QR mostraba el código de una mascota que
           * nunca se creó.
           */}
          <h1 className="text-foreground mt-5 text-xl font-bold">
            {pet
              ? `¡Listo! ${pet.nombre} ya tiene su libreta digital`
              : "¡Listo! Ya podés empezar a usar PetCloud"}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {pet
              ? "Este es su código QR. Tu veterinario lo escanea y accede al historial completo al instante."
              : "Desde tu panel podés cargar una mascota cuando quieras, o revisar los accesos que ya tenés."}
          </p>

          {pet ? (
            <div className="border-border mx-auto mt-6 w-40 rounded-xl border p-2">
              <QrPlaceholder />
            </div>
          ) : null}

          <Button
            size="lg"
            className="mt-8 w-full"
            onClick={() => {
              router.push(getPostLoginRoute("dueno"));
              router.refresh();
            }}
          >
            Ir a mi panel
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
