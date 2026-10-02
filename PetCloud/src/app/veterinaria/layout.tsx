import { getVetSession } from "@/features/vet/lib/vet-session";
import { VetShell } from "@/features/vet/components/shell/vet-shell";

export default async function VeterinariaLayout({
  children,
}: LayoutProps<"/">) {
  // El profesional y su institución se consultan una vez acá y bajan por
  // contexto: el sidebar, el topbar y los formularios clínicos los necesitan.
  const session = await getVetSession();

  return <VetShell session={session}>{children}</VetShell>;
}
