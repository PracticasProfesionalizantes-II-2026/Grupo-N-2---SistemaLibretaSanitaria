"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Eliminar",
  loading = false,
  loadingLabel = "Eliminando...",
  variant = "danger",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  loading?: boolean;
  /** Toda confirmación previa a este cambio era destructiva ("Eliminando..."); este texto cubre confirmaciones que no lo son (por ejemplo, reenviar una invitación). */
  loadingLabel?: string;
  /** Toda confirmación previa a este cambio era destructiva; este variant cubre confirmaciones que no lo son. */
  variant?: "danger" | "primary";
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant={variant} onClick={onConfirm} disabled={loading}>
            {loading ? loadingLabel : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-muted-foreground text-sm">{description}</p>
    </Modal>
  );
}
