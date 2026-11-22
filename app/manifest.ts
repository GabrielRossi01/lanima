import type { MetadataRoute } from "next";
import { THEME_COLORS } from "@/lib/theme/theme";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Lanima",
    short_name: "Lanima",
    description: "Planner de estudos de Biomedicina.",
    lang: "pt-BR",
    dir: "ltr",
    start_url: "/inicio",
    scope: "/",
    display: "standalone",
    orientation: "any",
    theme_color: THEME_COLORS.light,
    background_color: THEME_COLORS.light,
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
