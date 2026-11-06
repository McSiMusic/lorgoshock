import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lorgoshock: Open to Work",
  description: "Автономная пошаговая 4X-стратегия: Лоргошки против ИИ-корпорации.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
