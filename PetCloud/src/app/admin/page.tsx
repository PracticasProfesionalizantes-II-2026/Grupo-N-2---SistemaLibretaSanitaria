import { redirect } from "next/navigation";

/** `/admin` no es una pantalla: el área de administración es la cola de matrículas. */
export default function AdminIndexPage() {
  redirect("/admin/validaciones");
}
