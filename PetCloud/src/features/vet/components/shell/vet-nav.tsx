"use client";

import { ChevronDown, Lock } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { VET_BASE, type VetNavItem, visibleVetNav } from "@/config/vet-nav";
import { estaDentro, hrefActivo } from "@/features/vet/lib/nav-activa";
import { useVetSession } from "@/features/vet/components/shell/vet-session-provider";
import { cn } from "@/lib/utils";

/**
 * La lista de secciones del panel veterinario, compartida por el sidebar de
 * escritorio y el menú móvil.
 *
 * Está en un componente propio porque este shell lo aprendió a la mala:
 * `vet-shell.tsx` y `vet-sidebar.tsx` filtraban el menú y calculaban la ruta
 * activa por separado, y cada cambio había que acordarse de hacerlo dos veces.
 * Acá se hace una sola —incluido el filtro por Premium, que ahora tiene un
 * único punto de llamada.
 *
 * El menú es un acordeón de una sola hoja abierta: abrir una sección cierra la
 * otra. No es una preferencia estética. Con "Clínica" y "Administración"
 * desplegadas a la vez el sidebar llegaba a diecisiete filas y aparecía un
 * scroll adentro del propio menú, que es la forma más rápida de que una entrada
 * deje de existir para quien la usa. Quien está en administración no necesita la
 * sala de espera en pantalla.
 */
export function VetNav({
  className,
  collapsed,
  onNavigate,
}: {
  className?: string;
  /** Rail angosto de escritorio: solo iconos. El menú móvil nunca lo pasa. */
  collapsed?: boolean;
  /** El menú móvil cierra el cajón al navegar. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const vet = useVetSession();
  const premiumActivo = vet?.premium.activo ?? false;
  // El corte por Premium es por institución, nunca por el rol de la persona.
  // Acá solo se van las entradas `sinPremium: "oculta"`; las que bloquean
  // siguen en la lista y se dibujan con candado más abajo.
  const nav = visibleVetNav(premiumActivo);
  // Se resuelve una sola vez para todo el menú: la regla es global, no
  // entrada por entrada. Ver `hrefActivo()`.
  const activo = hrefActivo(nav, pathname);

  // Qué sección está abierta, por href. Arranca en la que contiene la pantalla
  // actual: entrar directo a `/veterinaria/erp/stock` desde un favorito tiene
  // que mostrar dónde estás parado, no dos secciones cerradas que hay que
  // adivinar. Si la ruta no cae en ninguna —"Configuración", por ejemplo, que
  // queda fuera de las dos— se abre la primera, que es el trabajo diario.
  const [seccionAbierta, setSeccionAbierta] = useState<string | null>(() => {
    const secciones = nav.filter((item) => item.hijos?.length);
    const dentro = secciones.find((item) => estaDentro(item, pathname));
    return (dentro ?? secciones[0])?.href ?? null;
  });

  return (
    <nav className={className}>
      {nav.map((item) =>
        item.hijos?.length ? (
          <VetNavSeccion
            key={item.href}
            item={item}
            pathname={pathname}
            activo={activo}
            collapsed={collapsed}
            onNavigate={onNavigate}
            premiumActivo={premiumActivo}
            abierta={seccionAbierta === item.href}
            onAbrir={() => setSeccionAbierta(item.href)}
            onAlternar={() =>
              setSeccionAbierta((actual) =>
                actual === item.href ? null : item.href,
              )
            }
          />
        ) : (
          <VetNavEnlace
            key={item.href}
            premiumActivo={premiumActivo}
            item={item}
            activo={activo}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ),
      )}
    </nav>
  );
}

const CLASES_FILA =
  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors";
const CLASES_ACTIVA = "bg-brand-50 text-brand-700";
const CLASES_INACTIVA =
  "text-muted-foreground hover:bg-muted hover:text-foreground";
// El encabezado de una sección se lee como título, no como una entrada más:
// versalita, gris y espaciado. Si compitiera visualmente con sus hijos, el menú
// volvería a leerse como una lista larga y plana, que es justo lo que el
// acordeón vino a resolver.
const CLASES_ENCABEZADO =
  "flex-1 text-left text-xs font-semibold tracking-wider uppercase";
const CLASES_SEPARADOR = "border-border mt-3 border-t pt-4";

function VetNavEnlace({
  item,
  activo,
  collapsed,
  onNavigate,
  premiumActivo,
  anidado = false,
  forzarActiva = false,
}: {
  item: VetNavItem;
  activo: string | null;
  collapsed?: boolean;
  onNavigate?: () => void;
  premiumActivo: boolean;
  anidado?: boolean;
  /**
   * El rail colapsado lo usa para encender la sección entera: ahí los hijos no
   * se dibujan, así que el ganador real de `hrefActivo()` no está en pantalla
   * y sin esto nada quedaría resaltado estando adentro del ERP.
   */
  forzarActiva?: boolean;
}) {
  // Entrada paga sin Premium: se muestra igual, con candado, y lleva al alta.
  // Esconderla dejaba a la veterinaria sin enterarse de que existe algo para
  // comprar. Se comprueba antes que `proximamente` porque un módulo que
  // todavía no existe y además es pago se lee mejor como pago: "Pronto" invita
  // a esperar, el candado invita a suscribirse.
  if (item.sinPremium === "bloquea" && !premiumActivo) {
    const etiqueta = `${item.label} — requiere Premium`;

    return (
      <Link
        href={`${VET_BASE}/premium`}
        onClick={onNavigate}
        title={etiqueta}
        aria-label={etiqueta}
        className={cn(
          CLASES_FILA,
          "text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground",
          collapsed && "justify-center px-0",
          anidado && !collapsed && "pl-9",
          item.abreEspacioAparte && CLASES_SEPARADOR,
        )}
      >
        <item.icon className="size-5 shrink-0" />
        {collapsed ? null : (
          <>
            <span className="flex-1">{item.label}</span>
            <Lock className="size-4 shrink-0" />
          </>
        )}
      </Link>
    );
  }

  if (item.proximamente) {
    return (
      <span
        className={cn(
          "text-muted-foreground/50 flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
          anidado && "pl-9",
        )}
        title="Próximamente"
      >
        <item.icon className="size-5 shrink-0" />
        {collapsed ? null : (
          <>
            <span className="flex-1">{item.label}</span>
            <span className="border-border rounded border px-1.5 py-0.5 text-[10px] tracking-wide uppercase">
              Pronto
            </span>
          </>
        )}
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={cn(
        CLASES_FILA,
        collapsed && "justify-center px-0",
        anidado && !collapsed && "pl-9",
        item.abreEspacioAparte && CLASES_SEPARADOR,
        forzarActiva || item.href === activo ? CLASES_ACTIVA : CLASES_INACTIVA,
      )}
    >
      <item.icon className="size-5 shrink-0" />
      {collapsed ? null : item.label}
    </Link>
  );
}

/**
 * Una sección plegable del menú: "Clínica" o "Administración".
 *
 * El encabezado cumple dos papeles a la vez, como el panel de Shopify: la fila
 * **navega** a la portada del área y de paso abre la sección, y el chevron de la
 * derecha **solo pliega**, sin moverte de pantalla. Repartirlos así evita el
 * problema clásico del acordeón con destino: si toda la fila plegara, no habría
 * forma de llegar a la portada; si toda la fila navegara, no habría forma de
 * cerrar la sección sin irte de donde estás.
 *
 * El chevron es un hermano de la fila y no un botón adentro del enlace: un
 * `<button>` dentro de un `<a>` es HTML inválido y en lector de pantalla se
 * anuncia como un solo control. Siendo hermanos, el chevron ya no navega por
 * construcción, que es lo que se buscaba.
 */
function VetNavSeccion({
  item,
  pathname,
  activo,
  collapsed,
  onNavigate,
  premiumActivo,
  abierta,
  onAbrir,
  onAlternar,
}: {
  item: VetNavItem;
  pathname: string;
  activo: string | null;
  collapsed?: boolean;
  onNavigate?: () => void;
  premiumActivo: boolean;
  abierta: boolean;
  /** La fila navega y además abre esta sección, cerrando la otra. */
  onAbrir: () => void;
  /** El chevron abre o cierra, sin navegar. */
  onAlternar: () => void;
}) {
  // En el rail colapsado no hay lugar para los hijos —mide 20 unidades y las
  // etiquetas no se ven—, así que la sección deja de plegarse y se comporta
  // como un enlace común: lleva a la portada del área, donde el menú sí está, y
  // se enciende si la pantalla actual cuelga de ella.
  if (collapsed) {
    return (
      <VetNavEnlace
        premiumActivo={premiumActivo}
        item={item}
        activo={activo}
        collapsed
        onNavigate={onNavigate}
        forzarActiva={estaDentro(item, pathname)}
      />
    );
  }

  const idPanel = `seccion-${item.href.replace(/\W+/g, "-")}`;

  return (
    <div className={cn(item.abreEspacioAparte && CLASES_SEPARADOR)}>
      <div
        className={cn(
          CLASES_FILA,
          "gap-1 px-0",
          // El encabezado NUNCA se resalta, aunque la ruta actual coincida con
          // su href: dónde estás parado lo dice el hijo. Pintarlo daba dos
          // filas encendidas para una sola pantalla.
          CLASES_INACTIVA,
        )}
      >
        <Link
          href={item.href}
          onClick={() => {
            onAbrir();
            onNavigate?.();
          }}
          className={cn(CLASES_ENCABEZADO, "rounded-lg px-3 py-0.5")}
        >
          {item.label}
        </Link>
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={abierta}
          aria-controls={idPanel}
          aria-label={`${abierta ? "Plegar" : "Desplegar"} ${item.label}`}
          className="hover:bg-muted hover:text-foreground mr-2 rounded p-1 transition-colors"
        >
          <ChevronDown
            className={cn(
              "size-4 shrink-0 transition-transform",
              abierta && "rotate-180",
            )}
          />
        </button>
      </div>

      {abierta ? (
        <div id={idPanel} className="mt-1 space-y-1">
          {item.hijos?.map((hijo) => (
            <VetNavEnlace
              key={hijo.href}
              premiumActivo={premiumActivo}
              item={hijo}
              activo={activo}
              onNavigate={onNavigate}
              anidado
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
