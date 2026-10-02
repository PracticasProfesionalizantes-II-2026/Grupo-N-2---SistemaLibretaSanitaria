import { Badge } from "@/components/ui/badge";
import {
  AYUDA_ANTIRRABICA,
  ETIQUETAS_ANTIRRABICA,
  type EstadoAntirrabica,
} from "@/features/public-qr/lib/rabies-status";

/**
 * El estado antirrábico en la ficha pública del collar.
 *
 * Es un componente propio y no una cuarta entrada de `HEALTH_LABELS` por dos
 * motivos. El primero es de tipos: `HealthStatusChip` está tipado con
 * `HealthStatus`, el estado del panel privado, y reusarlo reintroduce
 * exactamente el acoplamiento que la spec prohíbe — un valor agregado mañana
 * para una pantalla del dueño llegaría gratis a un escaneo anónimo. El segundo
 * es de copy: ese chip diría "Al día", y acá hace falta que diga "Antirrábica
 * al día". Un "Al día" suelto al lado de un semáforo general que también dice
 * "Al día" no informa nada.
 *
 * La línea de ayuda no es opcional ni decorativa. Sin ella, "Sin antirrábica
 * certificada" se lee como "este perro no está vacunado", que es una
 * afirmación que el sistema no puede hacer.
 */
export function RabiesBadge({ estado }: { estado: EstadoAntirrabica }) {
  const { label, variant } = ETIQUETAS_ANTIRRABICA[estado];

  return (
    <>
      <Badge variant={variant}>{label}</Badge>
      <p className="text-muted-foreground mt-1.5 text-xs">
        {AYUDA_ANTIRRABICA}
      </p>
    </>
  );
}
