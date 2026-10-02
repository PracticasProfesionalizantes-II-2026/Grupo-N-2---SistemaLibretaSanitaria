import { AdminShell } from "@/features/admin/components/shell/admin-shell";

export default function AdminLayout({ children }: LayoutProps<"/">) {
  return <AdminShell>{children}</AdminShell>;
}
