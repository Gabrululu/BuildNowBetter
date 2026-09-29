import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";

import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Build Now Better — Grafo de Reputación en Vivo",
  description: "Grafo de reputación en vivo para BNB Builder Sesions.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body>
        <Providers>
          <div className="shell">
            <header className="topbar">
              <span className="brand">
                <span className="brand-mark" aria-hidden="true" />
                BuildNowBetter
              </span>
              <span className="brand-tag">Grafo de Reputación en Vivo</span>
            </header>
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
