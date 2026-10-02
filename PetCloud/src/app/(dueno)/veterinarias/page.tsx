import type { Metadata } from "next";

import { VetDirectoryView } from "@/features/owner/components/vet-directory/vet-directory-view";
import { listVetDirectory } from "@/features/owner/data/vet-directory";

export const metadata: Metadata = { title: "Veterinarias" };

export default async function VetDirectoryPage() {
  const clinicas = await listVetDirectory();

  return <VetDirectoryView clinicas={clinicas} />;
}
