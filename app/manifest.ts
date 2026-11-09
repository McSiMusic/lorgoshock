import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lorgoshock: Open to Work",
    short_name: "Lorgoshock",
    description: "Автономная пошаговая 4X-стратегия: Лоргошки против ИИ-корпорации.",
    start_url: "./",
    scope: "./",
    display: "standalone",
    background_color: "#17182b",
    theme_color: "#17182b",
    icons: [
      {
        src: "./icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "./icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
