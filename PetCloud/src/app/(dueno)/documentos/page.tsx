import type { Metadata } from "next";

import { DocumentsView } from "@/features/owner/components/documents/documents-view";
import { listMyDocuments } from "@/features/owner/data/owner-queries";

export const metadata: Metadata = { title: "Documentos" };

export default async function DocumentosPage() {
  // Se traen los de todas sus mascotas y la vista filtra por la seleccionada:
  // cambiar de mascota en el selector no debería costar un viaje al servidor.
  const documents = await listMyDocuments();

  return <DocumentsView documents={documents} />;
}
