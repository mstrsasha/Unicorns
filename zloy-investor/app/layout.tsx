import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Злой инвестор — спарринг перед защитой стартапа",
  description: "ИИ-тренажёр защиты стартапа: 5 неудобных вопросов, честная оценка по 10 критериям и 3 совета до сцены.",
};

export const viewport: Viewport = {
  themeColor: "#121015",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
