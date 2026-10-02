"use client";

import { NotebookPen, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/textarea";
import {
  addPetNote,
  deletePetNote,
  updatePetNote,
} from "@/features/owner/actions/notes-actions";
import { formatLongDate } from "@/lib/format";
import type { PetNote } from "@/types/pet";

/**
 * Bloc de notas libre del dueño. No es información clínica: es lo que la persona
 * quiere recordar para la próxima consulta.
 */
export function NotesTab({
  petId,
  notes,
  petName,
  puedeEditar,
}: {
  /** `edit` u `owner`; la RLS lo exige igual, acá solo se evita ofrecer el botón. */
  puedeEditar: boolean;
  petId: string;
  notes: PetNote[];
  petName: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [borrando, setBorrando] = useState<string>();
  // La edición es en línea porque la nota ya es un textarea suelto: abrir un
  // modal para el mismo campo sería mudar de pantalla sin ganar nada.
  const [editandoId, setEditandoId] = useState<string>();
  const [editorDraft, setEditorDraft] = useState("");
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  async function handleAdd() {
    if (!draft.trim()) return;

    setSaving(true);
    const result = await addPetNote(petId, draft);
    setSaving(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    setDraft("");
    toast.success("Nota guardada.");
    router.refresh();
  }

  async function handleUpdate() {
    if (!editandoId || !editorDraft.trim()) return;

    setGuardandoEdicion(true);
    const result = await updatePetNote(editandoId, petId, editorDraft);
    setGuardandoEdicion(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    setEditandoId(undefined);
    toast.success("Nota actualizada.");
    router.refresh();
  }

  async function handleDelete(id: string) {
    setBorrando(id);
    const result = await deletePetNote(id, petId);
    setBorrando(undefined);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("Nota eliminada.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {puedeEditar ? (
        <Card className="p-5">
          <label
            htmlFor="nueva-nota"
            className="text-foreground text-sm font-medium"
          >
            Nueva nota sobre {petName}
          </label>
          <Textarea
            id="nueva-nota"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Algo que quieras recordar o contarle al veterinario en la próxima consulta..."
            className="mt-2"
          />
          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={saving || !draft.trim()}
            >
              {saving ? "Guardando..." : "Guardar nota"}
            </Button>
          </div>
        </Card>
      ) : null}

      {notes.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="Sin notas"
          description={`Usá este espacio para anotar cambios de conducta, síntomas o dudas sobre ${petName}.`}
        />
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li
              key={note.id}
              className="border-border bg-card flex items-start gap-4 rounded-xl border p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground text-xs">
                  {formatLongDate(note.fecha)}
                </p>

                {editandoId === note.id ? (
                  <>
                    <Textarea
                      value={editorDraft}
                      onChange={(event) => setEditorDraft(event.target.value)}
                      aria-label="Editar nota"
                      className="mt-2"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditandoId(undefined)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleUpdate}
                        disabled={guardandoEdicion || !editorDraft.trim()}
                      >
                        {guardandoEdicion ? "Guardando..." : "Guardar"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-foreground mt-1 text-sm">
                    {note.contenido}
                  </p>
                )}
              </div>

              {editandoId === note.id || !puedeEditar ? null : (
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditandoId(note.id);
                      setEditorDraft(note.contenido);
                    }}
                    className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-9 shrink-0 items-center justify-center rounded-lg"
                    aria-label="Editar nota"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(note.id)}
                    disabled={borrando === note.id}
                    className="text-muted-foreground hover:bg-muted hover:text-danger flex size-9 shrink-0 items-center justify-center rounded-lg disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Eliminar nota"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
