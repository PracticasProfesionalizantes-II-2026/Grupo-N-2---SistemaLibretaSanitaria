import { Logo } from "@/components/layout/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center px-6 py-12">
      <Logo className="mb-10" />
      <main className="flex w-full justify-center">{children}</main>
    </div>
  );
}
