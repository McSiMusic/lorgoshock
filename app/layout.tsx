import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lorgoshock: Open to Work",
  description: "Автономная пошаговая 4X-стратегия: Лоргошки против ИИ-корпорации.",
  applicationName: "Lorgoshock",
  appleWebApp: {
    capable: true,
    title: "Lorgoshock",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#17182b",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
