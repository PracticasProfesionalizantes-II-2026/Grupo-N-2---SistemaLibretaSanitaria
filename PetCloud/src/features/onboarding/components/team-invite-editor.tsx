"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TeamInviteEditor() {
  const [email, setEmail] = useState("");
  const [invites, setInvites] = useState<string[]>([]);

  function handleAdd() {
    const value = email.trim();
    if (!value) return;

    if (invites.includes(value)) {
      toast.error("Ese profesional ya está en la lista.");
      return;
    }

    setInvites((prev) => [...prev, value]);
    setEmail("");
  }

  return (
    <div>
      <div className="flex gap-2">
        <Input
          type="email"
          placeholder="email@veterinaria.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          aria-label="Email del profesional a invitar"
        />
        <Button type="button" variant="outline" onClick={handleAdd}>
          <Plus className="size-4" />
          Agregar
        </Button>
      </div>

      {invites.length > 0 ? (
        <ul className="divide-border border-border mt-4 divide-y rounded-lg border">
          {invites.map((invite) => (
            <li
              key={invite}
              className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
            >
              <span className="text-foreground">{invite}</span>
              <button
                type="button"
                onClick={() =>
                  setInvites((prev) => prev.filter((i) => i !== invite))
                }
                className="text-muted-foreground hover:text-danger"
                aria-label={`Quitar ${invite}`}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-border text-muted-foreground mt-4 rounded-lg border border-dashed p-4 text-center text-sm">
          Todavía no invitaste a nadie. Podés hacerlo más tarde desde
          Institución.
        </p>
      )}
    </div>
  );
}
