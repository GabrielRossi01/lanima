import type { Metadata, Viewport } from "next";
import { SerwistProvider } from "@serwist/turbopack/react";
import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/toast";
import { THEME_COLORS, themeBootScript } from "@/lib/theme/theme";
import { caveat, dmSans, fraunces } from "./fonts";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  applicationName: "Lanima",
  title: { default: "Lanima", template: "%s · Lanima" },
  description: "Planner de estudos de Biomedicina: matérias, caderno, resumos e testes, foco e ranking.",
  appleWebApp: { capable: true, title: "Lanima", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Overwritten before paint by the boot script to match the chosen theme.
  themeColor: THEME_COLORS.light,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="pt-BR"
      dir="ltr"
      // The boot script sets data-theme before hydration.
      suppressHydrationWarning
      className={`${fraunces.variable} ${dmSans.variable} ${caveat.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript() }} />
      </head>
      <body>
        {/*
          reloadOnOnline off: Serwist's default reloads the page whenever the network comes back,
          losing an open sheet, text being typed or a test in progress (and once in CI it reloaded
          the test page in the middle of going to the result). Lists refetch on their own and the
          outboxes send on "online"; only the offline fallback page reloads (OfflineReload).
        */}
        <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV === "development"} reloadOnOnline={false}>
          <Providers>{children}</Providers>
          <Toaster />
        </SerwistProvider>
      </body>
    </html>
  );
}
