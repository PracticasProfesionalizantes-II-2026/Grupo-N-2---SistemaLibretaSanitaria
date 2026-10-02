/**
 * Cada cuánto la pantalla de sala de espera se refresca sola.
 *
 * Vive en `lib/` (capa sin base ni React) para que sea importable desde un
 * test sin arrastrar `next/navigation` — lo que sí pasaría si esta constante
 * viviera dentro de `waiting-room-view.tsx` (un componente `"use client"`).
 */
export const WAITING_ROOM_POLL_MS = 20_000;
