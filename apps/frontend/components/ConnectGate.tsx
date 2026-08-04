"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useEffect, useState, type ReactNode } from "react";
import { useAccount } from "wagmi";

/**
 * Onboarding must never block the group demo. If wallet connect + sign hasn't completed within
 * this window, the phone falls into spectator mode on its own — same live view as the big
 * screen, plus a persistent "connect" affordance that works at any later point.
 */
const SPECTATOR_FALLBACK_MS = 20_000;

export function ConnectGate({ children }: { children: ReactNode }) {
  const { isConnected } = useAccount();
  const [spectatorMode, setSpectatorMode] = useState(false);

  useEffect(() => {
    if (isConnected) {
      setSpectatorMode(false);
      return;
    }

    const timeout = setTimeout(() => setSpectatorMode(true), SPECTATOR_FALLBACK_MS);
    return () => clearTimeout(timeout);
  }, [isConnected]);

  if (isConnected) {
    return <>{children}</>;
  }

  return (
    <div className="card">
      <span className="eyebrow">BNB AI Hack · DeSoc</span>
      <h1>BuildNowBetter</h1>
      {spectatorMode ? (
        <p className="muted">
          Estás en modo espectador — puedes seguir el workshop sin bloquear al grupo. Conecta tu
          wallet cuando quieras para unirte al grafo.
        </p>
      ) : (
        <p className="muted">Escanea el QR o conecta tu wallet para unirte al grafo en vivo.</p>
      )}
      <div className="connect-button">
        <ConnectButton label="Conectar wallet" showBalance={false} />
      </div>
    </div>
  );
}
