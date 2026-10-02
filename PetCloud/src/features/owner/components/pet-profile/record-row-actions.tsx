"use client";

import { Pencil, Trash2 } from "lucide-react";

/**
 * El par editar/borrar que llevan las filas de los tabs de salud.
 *
 * Quién ve estos botones no se decide acá: cada tab los renderiza únicamente
 * sobre lo que cargó el dueño (`origen === "dueno"`). La regla la impone el
 * servidor con un filtro en la consulta; esto solo evita ofrecer un botón que
 * la acción iba a rechazar.
 */
export function RecordRowActions({
  onEdit,
  onDelete,
  editLabel,
  deleteLabel,
}: {
  onEdit: () => void;
  onDelete: () => void;
  editLabel: string;
  deleteLabel: string;
}) {
  return (
    <span className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={onEdit}
        className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-11 shrink-0 items-center justify-center rounded-lg md:size-9"
        aria-label={editLabel}
      >
        <Pencil className="size-4" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="text-muted-foreground hover:bg-muted hover:text-danger flex size-11 shrink-0 items-center justify-center rounded-lg md:size-9"
        aria-label={deleteLabel}
      >
        <Trash2 className="size-4" />
      </button>
    </span>
  );
}
