"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import {
  removePetPhoto,
  uploadPetPhoto,
} from "@/features/owner/actions/photo-actions";
import { createPet, updatePet } from "@/features/owner/actions/pets-actions";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { ImageUpload } from "@/components/ui/image-upload";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useActivePet } from "@/features/owner/components/active-pet-provider";
import { ApproximateAgeInput } from "@/features/owner/components/pets/approximate-age-input";
import {
  type PetFormValues,
  avisoPesoInusual,
  breedsBySpecies,
  buscarMascotaDuplicada,
  crearPetFormSchema,
  tiposSangrePorEspecie,
} from "@/features/owner/schemas/pet-schema";
import { hoyArgentina } from "@/lib/argentina-time";
import { formatAge } from "@/lib/format";
import type { Pet } from "@/types/pet";

export function PetFormModal({
  open,
  onClose,
  pet,
}: {
  open: boolean;
  onClose: () => void;
  pet?: Pet;
}) {
  const isEdit = Boolean(pet);
  const router = useRouter();

  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoTouched, setFotoTouched] = useState(false);
  const [fechaAproximada, setFechaAproximada] = useState(false);
  const { pets } = useActivePet();

  /**
   * Mascota propia con el mismo nombre y especie que la que se está cargando.
   * Se pregunta, no se bloquea: dos hermanos de camada llamados igual existen,
   * y el servidor los acepta. "Sí, es otra" vuelve a enviar con
   * `duplicadoConfirmado` para no preguntar dos veces.
   */
  const [duplicada, setDuplicada] = useState<Pet>();

  // Con `legado`, el microchip o el tipo de sangre viejos de esta ficha se
  // aceptan sin cambios; uno nuevo o modificado sigue las reglas actuales.
  const schema = useMemo(
    () =>
      crearPetFormSchema(
        pet
          ? { microchip: pet.microchip, tipoSangre: pet.tipoSangre }
          : undefined,
      ),
    [pet],
  );

  const {
    register,
    setValue,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<PetFormValues>({
    resolver: zodResolver(schema),
    defaultValues: pet
      ? {
          nombre: pet.nombre,
          especie: pet.especie,
          raza: pet.raza,
          fechaNacimiento: pet.fechaNacimiento,
          sexo: pet.sexo,
          pesoKg: pet.pesoKg,
          color: pet.color,
          castrado: pet.castrado,
          microchip: pet.microchip,
          tipoSangre: pet.tipoSangre,
          veterinariaCabecera: pet.veterinariaCabecera,
        }
      : { castrado: false },
  });

  const especie = useWatch({ control, name: "especie" });
  const razaActual = useWatch({ control, name: "raza" });
  const tipoSangreActual = useWatch({ control, name: "tipoSangre" });
  const pesoActual = useWatch({ control, name: "pesoKg" });
  const avisoPeso = avisoPesoInusual(especie, pesoActual);

  /**
   * Las opciones de sangre de la especie, más el valor que la ficha ya tenía
   * si no figura (texto libre de antes): mismo criterio que las razas, para que
   * abrir a editar no lo borre sin avisar.
   */
  const tiposSangre = useMemo(() => {
    const deLaEspecie = especie ? tiposSangrePorEspecie[especie] : [];
    return tipoSangreActual && !deLaEspecie.includes(tipoSangreActual)
      ? [tipoSangreActual, ...deLaEspecie]
      : deLaEspecie;
  }, [especie, tipoSangreActual]);

  /**
   * Las razas de la especie elegida, más la que la mascota ya tenía si no
   * figura en esa lista.
   *
   * `pets.breed` es TEXT libre (002:44) y `breedsBySpecies` llegó después, así
   * que hay fichas viejas con razas escritas a mano —y las tres pantallas que
   * cargan mascotas ofrecen la misma lista corta—. Sin este agregado, abrir a
   * editar una de esas fichas mostraba el selector en blanco y guardar el
   * formulario **borraba la raza sin avisar**: un dato cargado por una persona
   * desaparecía por abrir una pantalla.
   */
  const breeds = useMemo(() => {
    const deLaEspecie =
      breedsBySpecies[especie ?? "perro"] ?? breedsBySpecies.perro;

    return razaActual && !deLaEspecie.includes(razaActual)
      ? [razaActual, ...deLaEspecie]
      : deLaEspecie;
  }, [especie, razaActual]);

  const guardar = (duplicadoConfirmado: boolean) =>
    handleSubmit(async (values) => {
      let petId: string;

      if (!isEdit && !duplicadoConfirmado) {
        const existente = buscarMascotaDuplicada(pets, values);
        if (existente) {
          setDuplicada(existente);
          return;
        }
      }

      /**
       * Guardar los datos es lo único que puede dejar el formulario abierto.
       *
       * El `try` cubre algo que un `ActionResult` no alcanza a contar: una Server
       * Action que **rechaza** en vez de devolver un resultado (el cuerpo excede
       * el límite, se cortó la red, el servidor devolvió 500). Sin él, la
       * excepción se propagaba fuera del `handleSubmit` y no corría nada de lo
       * que viene después — ni el aviso, ni el cierre.
       */
      try {
        if (isEdit && pet) {
          const result = await updatePet(pet.id, values);
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          petId = pet.id;
        } else {
          const result = await createPet(values);
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          petId = result.petId;
        }
      } catch {
        toast.error(
          "No pudimos guardar los datos. Revisá tu conexión e intentá de nuevo.",
        );
        return;
      }

      /**
       * De acá en adelante la mascota YA EXISTE, y eso cambia las reglas.
       *
       * Pase lo que pase con la foto, el formulario tiene que cerrarse: dejarlo
       * abierto invita a apretar "Guardar" otra vez, y ese segundo intento no
       * reintenta nada — crea una mascota duplicada. Por eso la foto se avisa,
       * pero nunca frena el cierre.
       *
       * Va aparte del alta porque las políticas de Storage necesitan la fila ya
       * creada para saber que el dueño tiene acceso de edición.
       */
      if (fotoTouched) {
        try {
          let fotoResult;
          if (fotoFile) {
            const fd = new FormData();
            fd.set("archivo", fotoFile);
            fotoResult = await uploadPetPhoto(petId, fd);
          } else {
            fotoResult = await removePetPhoto(petId);
          }

          if (!fotoResult.success) throw new Error(fotoResult.error);
        } catch {
          // Un solo mensaje para el fallo devuelto y para la excepción: a quien
          // lo lee le sirve lo mismo, y lo que necesita es saber que los datos
          // están a salvo y por dónde reintentar la foto.
          toast.error(
            `Guardamos los datos de ${values.nombre}, pero la foto no se pudo subir. Probá cargarla de nuevo desde "Editar".`,
          );

          router.refresh();
          onClose();
          return;
        }
      }

      toast.success(
        isEdit
          ? `Se actualizaron los datos de ${values.nombre}.`
          : `${values.nombre} se agregó a tus mascotas con su QR generado.`,
      );

      // El listado y el selector del topbar salen del layout, que es servidor:
      // sin refrescar, la mascota nueva no aparece hasta recargar a mano.
      router.refresh();
      onClose();
    });

  const onSubmit = guardar(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Editar a ${pet?.nombre}` : "Nueva mascota"}
      description={
        isEdit
          ? undefined
          : "Al guardar se genera automáticamente el código QR de la mascota."
      }
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="pet-form" disabled={isSubmitting}>
            {isSubmitting ? "Guardando..." : "Guardar"}
          </Button>
        </>
      }
    >
      <form noValidate id="pet-form" onSubmit={onSubmit} className="space-y-5">
        <ImageUpload
          label="Subir foto"
          hint="JPG o PNG, hasta 5 MB."
          value={pet?.fotoUrl}
          disabled={isSubmitting}
          onChange={(file) => {
            setFotoFile(file);
            setFotoTouched(true);
          }}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Nombre"
            htmlFor="nombre"
            error={errors.nombre?.message}
            required
          >
            <Input id="nombre" {...register("nombre")} />
          </Field>

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
                // Cambiar de especie deja huérfana la raza ya elegida: "Siamés"
                // no existe entre las razas de perro, y sin limpiar el campo la
                // combinación imposible se guardaba igual.
                onChange: () => {
                  setValue("raza", "");
                  // Mismo motivo: "AB" no es un tipo de sangre de perro.
                  setValue("tipoSangre", "");
                },
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
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Raza"
            htmlFor="raza"
            error={errors.raza?.message}
            required
          >
            <Select id="raza" defaultValue="" {...register("raza")}>
              <option value="" disabled>
                Elegí una opción
              </option>
              {breeds.map((breed) => (
                <option key={breed} value={breed}>
                  {breed}
                </option>
              ))}
            </Select>
          </Field>

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
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                // Tope del calendario nativo (el schema lo rechaza igual, es
                // solo UX). Por render y en hora argentina, no al cargar el módulo.
                max={hoyArgentina()}
                {...register("fechaNacimiento")}
              />
            )}
            <label
              htmlFor="fechaAproximada"
              className="text-muted-foreground mt-2 flex items-center gap-2 text-xs"
            >
              <Checkbox
                id="fechaAproximada"
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

          <Field
            label="Peso actual (kg)"
            htmlFor="pesoKg"
            error={errors.pesoKg?.message}
            hint={errors.pesoKg ? undefined : (avisoPeso ?? undefined)}
            required
          >
            <Input
              id="pesoKg"
              type="number"
              step="0.1"
              min="0"
              max="100"
              {...register("pesoKg", { valueAsNumber: true })}
            />
          </Field>
        </div>

        <Field
          label="Color / señas particulares"
          htmlFor="color"
          hint="Opcional"
        >
          <Input id="color" {...register("color")} />
        </Field>

        <label
          htmlFor="castrado"
          className="text-foreground flex items-center gap-2 text-sm"
        >
          <Checkbox id="castrado" {...register("castrado")} className="mt-0" />
          Está castrado/a
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Nº de microchip"
            htmlFor="microchip"
            error={errors.microchip?.message}
            hint="Opcional. 15 números, los espacios no cuentan."
          >
            <Input
              id="microchip"
              inputMode="numeric"
              {...register("microchip")}
            />
          </Field>

          <Field
            label="Tipo de sangre"
            htmlFor="tipoSangre"
            error={errors.tipoSangre?.message}
            hint="Opcional"
          >
            <Select
              id="tipoSangre"
              defaultValue=""
              disabled={!especie}
              {...register("tipoSangre")}
            >
              <option value="">No sé</option>
              {tiposSangre.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {tipo}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="Veterinaria de cabecera"
          htmlFor="veterinariaCabecera"
          hint="Opcional"
        >
          <Input
            id="veterinariaCabecera"
            {...register("veterinariaCabecera")}
          />
        </Field>

        {duplicada ? (
          <Alert variant="warning">
            <div className="space-y-3">
              <p>
                Ya tenés a {duplicada.nombre}, {duplicada.especie}
                {duplicada.fechaNacimiento
                  ? `, ${formatAge(duplicada.fechaNacimiento)}`
                  : ""}
                . ¿Es otra mascota?
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={isSubmitting}
                  onClick={() => {
                    setDuplicada(undefined);
                    void guardar(true)();
                  }}
                >
                  Sí, es otra mascota
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setDuplicada(undefined)}
                >
                  Revisar los datos
                </Button>
              </div>
            </div>
          </Alert>
        ) : null}

        {isEdit ? null : (
          <Alert variant="info">
            El código QR se genera solo al guardar y queda disponible en la
            sección ID / QR de la mascota.
          </Alert>
        )}
      </form>
    </Modal>
  );
}
