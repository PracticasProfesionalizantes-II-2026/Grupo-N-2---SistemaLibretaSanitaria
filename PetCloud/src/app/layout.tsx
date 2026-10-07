import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { AppToaster } from "@/components/ui/app-toaster";
import { siteConfig } from "@/config/site";
import { getSiteUrlFromEnv } from "@/lib/site-url";

import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

const TITULO_POR_DEFECTO = `${siteConfig.name} — ${siteConfig.tagline}`;

const DESCRIPCION =
  "PetCloud reemplaza la libreta sanitaria de papel por un registro digital único, centralizado y siempre accesible para dueños, veterinarias y municipios. Gratis.";

/**
 * `metadataBase` sale de la variable de entorno y no de `getSiteUrl()`: esta
 * constante se evalúa al cargar el módulo, y ahí no hay request del que deducir
 * el dominio. Sin la variable configurada, Next resuelve las URLs relativas
 * contra el host de la corrida, que en desarrollo es lo correcto.
 */
const sitio = getSiteUrlFromEnv();

export const metadata: Metadata = {
  ...(sitio ? { metadataBase: new URL(sitio) } : {}),
  title: {
    default: TITULO_POR_DEFECTO,
    template: `%s · ${siteConfig.name}`,
  },
  description: DESCRIPCION,
  applicationName: siteConfig.name,
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/apple-touch-icon.png",
  },
  // Se comparte por WhatsApp entre vecinos y por mail a municipios: sin esto el
  // enlace viaja como una línea de texto pelada.
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: siteConfig.name,
    title: TITULO_POR_DEFECTO,
    description: DESCRIPCION,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${siteConfig.name} — ${siteConfig.tagline}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITULO_POR_DEFECTO,
    description: DESCRIPCION,
    images: ["/og-image.png"],
  },
};

// Color que pinta la barra del navegador en Android/Chrome.
export const viewport: Viewport = {
  themeColor: "#111827",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-AR"
      className={`${jakarta.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <ThemeProvider>
          {children}
          <AppToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
