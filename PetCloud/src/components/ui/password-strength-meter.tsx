import { getPasswordStrength } from "@/lib/password-strength";
import { cn } from "@/lib/utils";

const BAR_COLORS = [
  "bg-border",
  "bg-danger",
  "bg-accent-500",
  "bg-brand-500",
  "bg-success",
];

export function PasswordStrengthMeter({ password }: { password: string }) {
  const { score, label } = getPasswordStrength(password);

  if (!password) return null;

  return (
    <div className="mt-2">
      <div className="flex gap-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              i < score ? BAR_COLORS[score] : "bg-border",
            )}
          />
        ))}
      </div>
      <p className="text-muted-foreground mt-1.5 text-xs">{label}</p>
    </div>
  );
}
