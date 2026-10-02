import type { Metadata } from "next";

import { AccountUnderReviewPanel } from "@/features/auth/components/account-under-review-panel";

export const metadata: Metadata = { title: "Cuenta en revisión" };

export default function CuentaEnRevisionPage() {
  return <AccountUnderReviewPanel />;
}
