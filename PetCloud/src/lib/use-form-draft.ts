"use client";

import { useEffect, useRef } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

/**
 * Guarda un borrador temporal de un formulario en `sessionStorage`, para que
 * los datos sobrevivan a un "volví atrás", un cambio de pantalla o cerrar la
 * pestaña por error — pero no para siempre: pasado `DRAFT_TTL_MS` se
 * descarta solo, y nunca guarda los campos de `excludeFields` (las
 * contraseñas, siempre).
 *
 * `sessionStorage` en vez de `localStorage` a propósito: ya limpia sola al
 * cerrar la pestaña, así que el TTL es la única red de contención que hace
 * falta agregar — no hace falta acordarse de borrar nada al cerrar sesión
 * del sistema operativo o del navegador.
 */
const DRAFT_TTL_MS = 30 * 60 * 1000;

type Draft = { savedAt: number; values: Record<string, unknown> };

export function useFormDraft<T extends FieldValues>(
  key: string,
  form: UseFormReturn<T>,
  excludeFields: Path<T>[] = [],
) {
  const storageKey = `petcloud:draft:${key}`;
  // Ref, no el array tal cual: si quien llama pasa `[]` o una lista inline,
  // una referencia nueva en cada render no debe reiniciar la suscripción de
  // más abajo. Se actualiza en un efecto, nunca durante el render.
  const excludeRef = useRef(excludeFields);
  useEffect(() => {
    excludeRef.current = excludeFields;
  });
  const hydrated = useRef(false);

  // Hidratar una sola vez, al montar — nunca durante los renders siguientes,
  // para no pisar lo que la persona ya empezó a corregir.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;

    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return;

      const draft: Draft = JSON.parse(raw);
      if (Date.now() - draft.savedAt > DRAFT_TTL_MS) {
        sessionStorage.removeItem(storageKey);
        return;
      }

      for (const [field, value] of Object.entries(draft.values)) {
        form.setValue(field as Path<T>, value as T[Path<T>], {
          shouldValidate: false,
        });
      }
    } catch {
      // `sessionStorage` puede no estar disponible (SSR, modo privado) o el
      // JSON puede venir corrupto de una versión vieja del borrador — en
      // cualquier caso, el formulario arranca vacío como si no hubiera
      // borrador, nunca rompe la pantalla.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `form` es estable (useForm no cambia de identidad entre renders) y `storageKey` es la única dependencia real.
  }, [storageKey]);

  // Guardar en cada cambio, salvo los campos excluidos.
  useEffect(() => {
    const subscription = form.watch((values) => {
      const limpio: Record<string, unknown> = {};
      for (const [field, value] of Object.entries(values)) {
        if (excludeRef.current.includes(field as Path<T>)) continue;
        limpio[field] = value;
      }

      try {
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({ savedAt: Date.now(), values: limpio }),
        );
      } catch {
        // Igual que en la hidratación: si no se puede guardar, el formulario
        // sigue funcionando normal, solo sin borrador.
      }
    });

    return () => subscription.unsubscribe();
  }, [form, storageKey]);

  function clearDraft() {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // no-op: sin storage no hay nada que borrar.
    }
  }

  return { clearDraft };
}
