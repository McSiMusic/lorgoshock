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
        src: "./icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "./icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "./icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
