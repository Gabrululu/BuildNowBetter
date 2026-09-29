import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "BuildNowBetter — Pantalla en vivo",
  description: "Grafo de reputación y leaderboard proyectados en pantalla grande.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
