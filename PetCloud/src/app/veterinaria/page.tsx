import { redirect } from "next/navigation";

/** `/veterinaria` no es una pantalla: el panel arranca en Gestión. */
export default function VeterinariaIndexPage() {
  redirect("/veterinaria/gestion");
}
