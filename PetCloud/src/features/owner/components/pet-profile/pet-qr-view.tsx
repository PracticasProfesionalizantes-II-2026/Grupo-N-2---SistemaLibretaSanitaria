"use client";

import { Download, Link2, Printer, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";

import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { QrPlaceholder } from "@/components/ui/qr-placeholder";
import { Switch } from "@/components/ui/switch";
import { HealthStatusChip } from "@/components/ui/status-chip";
import { RabiesBadge } from "@/features/public-qr/components/rabies-badge";
import type { EstadoAntirrabica } from "@/features/public-qr/lib/rabies-status";
import type {
  QrPublicConfig,
  QrPublicField,
} from "@/features/public-qr/lib/qr-public-config";
import {
  regeneratePetQrCode,
  updateQrConfig,
} from "@/features/owner/actions/pets-actions";
import { downloadBlob } from "@/lib/export";
import { capitalize, formatAge } from "@/lib/format";
import { crearDocumento } from "@/lib/pdf/documento";
import { cn } from "@/lib/utils";
import type { Pet } from "@/types/pet";

/**
 * Campos que el dueño puede exponer u ocultar en la ficha pública del QR. Se
 * guardan en `pets.qr_public_config` y los aplica el servidor al armar la
 * ficha (`proyectarMascotaPublica`): esto no es una preferencia de pantalla.
 */
const PRIVACY_FIELDS: {
  key: QrPublicField | "nombre";
  label: string;
}[] = [
  { key: "show_photo", label: "Foto de la mascota" },
  { key: "nombre", label: "Nombre" },
  { key: "show_species_breed_sex", label: "Especie, raza y sexo" },
  { key: "show_age", label: "Edad" },
  { key: "show_markings", label: "Señas (color y marcas)" },
  { key: "show_neutered", label: "Castrado" },
  { key: "show_vaccination", label: "Estado de vacunación" },
  { key: "show_municipal_registry", label: "Nº de registro municipal" },
  { key: "show_microchip", label: "Nº de microchip" },
];

const archivoBase = (nombre: string) =>
  `qr-${nombre.toLowerCase().replace(/\s+/g, "-")}`;

export function PetQrView({
  pet,
  siteUrl,
  estadoAntirrabica,
  config: configGuardada,
  registroMunicipal,
  puedeEditar,
}: {
  pet: Pet;
  /** `edit` u `owner`: sin esto el QR se ve y se descarga, pero no se toca. */
  puedeEditar: boolean;
  siteUrl: string;
  /** El mismo que calcula la ficha pública (`public_rabies_status`). */
  estadoAntirrabica: EstadoAntirrabica;
  config: QrPublicConfig;
  registroMunicipal: string | null;
}) {
  const router = useRouter();
  const [qrCode, setQrCode] = useState(pet.qrCode);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [config, setConfig] = useState(configGuardada);
  const [regenerating, setRegenerating] = useState(false);
  const [working, setWorking] = useState(false);

  const publicUrl = `${siteUrl}/p/${qrCode}`;

  // El QR se genera de verdad acá, en el navegador: codifica la URL pública
  // completa, no un dibujo decorativo. Se re-arma cada vez que cambia el
  // código (por ejemplo, después de regenerarlo).
  useEffect(() => {
    let vigente = true;

    QRCode.toDataURL(publicUrl, { width: 480, margin: 1 }).then((dataUrl) => {
      if (vigente) setQrImage(dataUrl);
    });

    return () => {
      vigente = false;
    };
  }, [publicUrl]);

  async function handleRegenerate() {
    setWorking(true);
    const resultado = await regeneratePetQrCode(pet.id);
    setWorking(false);
    setRegenerating(false);

    if (!resultado.success) {
      toast.error(resultado.error);
      return;
    }

    setQrCode(resultado.qrCode);
    toast.success("Se generó un QR nuevo. El anterior dejó de funcionar.");
    router.refresh();
  }

  // Optimista: el switch se mueve ya y vuelve atrás si el servidor no guardó.
  // Se revierte solo la clave que falló, no toda la configuración, por si hubo
  // otro cambio en el medio.
  async function handleToggle(key: QrPublicField, checked: boolean) {
    setConfig((prev) => ({ ...prev, [key]: checked }));

    const resultado = await updateQrConfig(pet.id, { [key]: checked });

    if (!resultado.success) {
      setConfig((prev) => ({ ...prev, [key]: !checked }));
      toast.error(resultado.error);
    }
  }

  async function handleDownloadPng() {
    if (!qrImage) return;

    const blob = await (await fetch(qrImage)).blob();
    downloadBlob(`${archivoBase(pet.nombre)}.png`, blob);
    toast.success("Se descargó el QR en PNG.");
  }

  function handleDownloadPdf() {
    if (!qrImage) return;

    const pdf = crearDocumento();
    pdf.encabezado(`Chapita de ${pet.nombre}`, `Nº de collar ${qrCode}`);

    const tamano = 80;
    const x = (pdf.ancho - tamano) / 2;
    pdf.doc.addImage(qrImage, "PNG", x, pdf.y, tamano, tamano);
    pdf.y += tamano + 8;

    pdf.doc.setFont("helvetica", "normal");
    pdf.doc.setFontSize(10);
    pdf.doc.text(publicUrl.replace(/^https?:\/\//, ""), pdf.ancho / 2, pdf.y, {
      align: "center",
    });

    downloadBlob(`${archivoBase(pet.nombre)}.pdf`, pdf.blob());
    toast.success("Se generó el PDF para imprimir.");
  }

  async function handleShare() {
    await navigator.clipboard.writeText(publicUrl);
    toast.success("Se copió el enlace al portapapeles.");
  }

  return (
    <div>
      <PageHeader
        title={`ID / QR de ${pet.nombre}`}
        description="El QR es la llave de acceso a la ficha sanitaria. Podés imprimirlo para la chapita del collar."
        breadcrumbs={[
          { label: "Mis mascotas", href: "/mis-mascotas" },
          { label: pet.nombre, href: `/mascotas/${pet.id}` },
          { label: "ID / QR" },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[22rem_1fr]">
        <Card className="flex flex-col items-center p-6">
          {qrImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrImage} alt={`QR de ${pet.nombre}`} className="w-56" />
          ) : (
            <QrPlaceholder className="w-56" />
          )}

          <p className="text-muted-foreground mt-4 font-mono text-sm">
            {qrCode}
          </p>
          <p className="text-muted-foreground mt-1 text-xs break-all">
            {publicUrl.replace(/^https?:\/\//, "")}
          </p>

          <div className="mt-6 grid w-full grid-cols-1 gap-2">
            <Button
              variant="outline"
              disabled={!qrImage}
              onClick={handleDownloadPng}
            >
              <Download className="size-4" />
              Descargar PNG
            </Button>
            <Button
              variant="outline"
              disabled={!qrImage}
              onClick={handleDownloadPdf}
            >
              <Printer className="size-4" />
              PDF para imprimir (chapita)
            </Button>
            <Button variant="outline" onClick={handleShare}>
              <Link2 className="size-4" />
              Compartir enlace
            </Button>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-foreground font-semibold">
              Qué ve alguien que escanea el QR
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Sin iniciar sesión solo se ve esta ficha reducida, pensada para el
              caso de mascota perdida. El historial clínico nunca es público.
            </p>

            {/* Los mismos campos y las mismas condiciones que la ficha del
                collar (`collar-profile.tsx`): si acá se ve, allá se ve. */}
            <div className="border-border mt-4 flex items-center gap-3 border-t pt-4">
              <Avatar
                name={pet.nombre}
                src={config.show_photo ? pet.fotoUrl : undefined}
                size="lg"
              />
              <div>
                <p className="text-foreground font-semibold">{pet.nombre}</p>
                <p className="text-muted-foreground text-sm">
                  {[
                    config.show_species_breed_sex
                      ? capitalize(pet.especie)
                      : null,
                    config.show_species_breed_sex ? pet.raza : null,
                    config.show_age ? formatAge(pet.fechaNacimiento) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              {config.show_vaccination ? (
                <>
                  <div className="col-span-2">
                    <dt className="text-muted-foreground text-xs">
                      Antirrábica
                    </dt>
                    <dd className="mt-1">
                      <RabiesBadge estado={estadoAntirrabica} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">
                      Vacunación general
                    </dt>
                    <dd className="mt-1">
                      <HealthStatusChip status={pet.estadoSanitario} />
                    </dd>
                  </div>
                </>
              ) : null}
              {config.show_species_breed_sex && pet.sexo ? (
                <PreviewDato label="Sexo" valor={capitalize(pet.sexo)} />
              ) : null}
              {config.show_markings && pet.color ? (
                <PreviewDato label="Señas" valor={pet.color} />
              ) : null}
              {config.show_neutered ? (
                <PreviewDato
                  label="Castrado"
                  valor={pet.castrado ? "Sí" : "No"}
                />
              ) : null}
              <PreviewDato label="Nº de collar" valor={qrCode} mono />
              {config.show_municipal_registry && registroMunicipal ? (
                <PreviewDato
                  label="Registro municipal"
                  valor={registroMunicipal}
                  mono
                />
              ) : null}
              {config.show_microchip && pet.microchip ? (
                <PreviewDato label="Microchip" valor={pet.microchip} mono />
              ) : null}
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="text-foreground font-semibold">Privacidad del QR</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Elegí qué datos son visibles para quien escanee sin sesión
              iniciada.
            </p>

            <div className="mt-5 space-y-4">
              {PRIVACY_FIELDS.map((field) => (
                <Switch
                  key={field.key}
                  id={`privacy-${field.key}`}
                  label={field.label}
                  description={
                    field.key === "nombre"
                      ? "Siempre visible: identifica a la mascota"
                      : undefined
                  }
                  checked={field.key === "nombre" ? true : config[field.key]}
                  disabled={field.key === "nombre" || !puedeEditar}
                  onChange={(checked) => {
                    if (field.key !== "nombre") {
                      void handleToggle(field.key, checked);
                    }
                  }}
                />
              ))}
            </div>
          </Card>

          {puedeEditar ? (
            <Card className="p-5">
              <h2 className="text-foreground font-semibold">Regenerar QR</h2>
              <Alert variant="warning" className="mt-3">
                Al regenerar el código, el QR impreso anterior deja de
                funcionar. Usalo si perdiste la chapita o creés que alguien más
                tiene el enlace.
              </Alert>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setRegenerating(true)}
              >
                <RefreshCw className="size-4" />
                Regenerar código QR
              </Button>
            </Card>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={regenerating}
        onClose={() => setRegenerating(false)}
        onConfirm={handleRegenerate}
        title="¿Regenerar el código QR?"
        description={`El QR actual de ${pet.nombre} dejará de funcionar y vas a tener que imprimir la chapita de nuevo. Esta acción no se puede deshacer.`}
        confirmLabel="Regenerar"
        loading={working}
      />
    </div>
  );
}

function PreviewDato({
  label,
  valor,
  mono = false,
}: {
  label: string;
  valor: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={cn(
          "text-foreground mt-0.5 text-sm font-medium",
          mono && "font-mono",
        )}
      >
        {valor}
      </dd>
    </div>
  );
}
