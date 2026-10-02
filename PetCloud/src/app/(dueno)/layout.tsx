import { getCurrentUser } from "@/features/auth/lib/current-user";
import { OwnerShell } from "@/features/owner/components/shell/owner-shell";
import { listMyPets } from "@/features/owner/data/owner-queries";

export default async function DuenoLayout({ children }: LayoutProps<"/">) {
  // Las mascotas y la persona se consultan una vez acá y bajan por contexto:
  // el selector del topbar, el sidebar y el saludo del inicio las necesitan.
  const [pets, user] = await Promise.all([listMyPets(), getCurrentUser()]);

  return (
    <OwnerShell pets={pets} user={user}>
      {children}
    </OwnerShell>
  );
}
