export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
};

const LABELS = ["Muy débil", "Débil", "Aceptable", "Fuerte", "Muy fuerte"];

export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: LABELS[0] };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  const clamped = Math.min(score, 4) as PasswordStrength["score"];
  return { score: clamped, label: LABELS[clamped] };
}
