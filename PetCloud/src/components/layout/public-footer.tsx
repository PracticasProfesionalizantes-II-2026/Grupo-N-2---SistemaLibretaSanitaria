import Link from "next/link";

import { Container } from "@/components/ui/container";
import { footerNav, siteConfig } from "@/config/site";

import { Logo } from "./logo";

const columns = [
  { title: "Producto", items: footerNav.producto },
  { title: "Soluciones", items: footerNav.soluciones },
  { title: "Empresa", items: footerNav.empresa },
  { title: "Legales", items: footerNav.legales },
];

export function PublicFooter() {
  return (
    <footer className="border-border bg-muted border-t">
      <Container className="py-16">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="text-muted-foreground mt-4 max-w-xs text-sm">
              {siteConfig.description}
            </p>
          </div>

          {columns.map((column) => (
            <div key={column.title}>
              <h3 className="text-foreground text-sm font-semibold">
                {column.title}
              </h3>
              <ul className="mt-4 space-y-3">
                {column.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-muted-foreground hover:text-foreground text-sm"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-border text-muted-foreground mt-12 flex flex-col gap-4 border-t pt-8 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {siteConfig.name}. Todos los derechos
            reservados.
          </p>
          <p>Gratis para dueños, veterinarias y municipios.</p>
        </div>
      </Container>
    </footer>
  );
}
