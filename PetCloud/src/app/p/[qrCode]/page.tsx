import type { Metadata } from "next";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/layout/logo";
import { CollarProfile } from "@/features/public-qr/components/collar-profile";
import { getPublicPetByQr } from "@/features/public-qr/data/public-pet";
import { getCurrentUser } from "@/features/auth/lib/current-user";
import { getPostLoginRoute } from "@/config/roles";

export async function generateMetadata({
  params,
}: PageProps<"/p/[qrCode]">): Promise<Metadata> {
  const { qrCode } = await params;
  const resultado = await getPublicPetByQr(qrCode);

  if (resultado.estado !== "ok") return { title: "Collar no encontrado" };

  return {
    title: resultado.mascota.nombre,
    description: `Ficha pública del collar de ${resultado.mascota.nombre}.`,
  };
}

/**
 * Los tres finales que no son una mascota: un código revocado quiere decir que
 * la chapita es vieja pero la mascota está en PetCloud, y eso es una pista.
 */
const SIN_MASCOTA = {
  revocado: {
    titulo: "Esta chapita está dada de baja",
    detalle:
      "El código existió pero su dueño lo reemplazó. La mascota puede seguir en PetCloud con un collar nuevo: si la tenés con vos, llevala a cualquier veterinaria adherida y que escaneen el collar actual.",
  },
  "no-encontrada": {
    titulo: "No encontramos este collar",
    detalle:
      "Revisá que el código esté bien tipeado. Tiene el formato PC-XXXX-XXXX y está impreso debajo del QR.",
  },
  "qr-invalido": {
    titulo: "Ese código no es de PetCloud",
    detalle:
      "Los collares de PetCloud tienen el formato PC-XXXX-XXXX. Puede que el lector haya agarrado otra etiqueta.",
  },
} as const;

export default async function CollarPage({ params }: PageProps<"/p/[qrCode]">) {
  const { qrCode } = await params;
  const resultado = await getPublicPetByQr(qrCode);

  if (resultado.estado !== "ok") {
    const copy = SIN_MASCOTA[resultado.estado];

    return (
      <div className="bg-muted min-h-svh">
        <header className="border-border bg-card border-b">
          <Container className="flex h-16 items-center">
            <Logo />
          </Container>
        </header>
        <Container className="py-12">
          <Card className="mx-auto max-w-lg p-8 text-center">
            <h1 className="text-foreground text-xl font-bold">{copy.titulo}</h1>
            <p className="text-muted-foreground mt-3 text-sm">{copy.detalle}</p>
            <Link
              href="/"
              className="text-brand-700 mt-6 inline-block text-sm font-medium hover:underline"
            >
              Ir a PetCloud
            </Link>
          </Card>
        </Container>
      </div>
    );
  }

  const user = await getCurrentUser();

  return (
    <CollarProfile
      pet={resultado.mascota}
      logoHref={user ? getPostLoginRoute(user.role) : undefined}
    />
  );
}
