import { cn } from "@/lib/utils";

const SIZE = 21;

/**
 * Dibuja un QR decorativo: marcadores de esquina reales y datos pseudoaleatorios
 * deterministas. No codifica información — el QR real se genera en el backend.
 */
function buildCells() {
  const cells: boolean[] = [];

  const inFinder = (row: number, col: number) => {
    const corners = [
      [0, 0],
      [0, SIZE - 7],
      [SIZE - 7, 0],
    ];

    return corners.some(([r0, c0]) => {
      const r = row - r0;
      const c = col - c0;
      if (r < 0 || r > 6 || c < 0 || c > 6) return false;
      const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
      return ring !== 2;
    });
  };

  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (inFinder(row, col)) {
        cells.push(true);
        continue;
      }
      cells.push((row * 7 + col * 13 + ((row * col) % 5)) % 3 === 0);
    }
  }

  return cells;
}

const CELLS = buildCells();

export function QrPlaceholder({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "grid aspect-square gap-px rounded-lg bg-white p-2",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
      aria-hidden
    >
      {CELLS.map((filled, i) => (
        <span key={i} className={filled ? "bg-foreground" : "bg-transparent"} />
      ))}
    </div>
  );
}
