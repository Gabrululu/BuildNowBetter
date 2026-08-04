"use client";

import { identityRegistryAbi } from "@buildnowbetter/shared";
import { useEffect, useState } from "react";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

const IDENTITY_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS as
  | `0x${string}`
  | undefined;

export function RegisterIdentityCard() {
  const { address } = useAccount();
  const [displayName, setDisplayName] = useState("");

  const {
    data: isRegistered,
    refetch,
    isLoading: isCheckingRegistration,
  } = useReadContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: identityRegistryAbi,
    functionName: "isRegistered",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && IDENTITY_REGISTRY_ADDRESS) },
  });

  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess) {
      void refetch();
    }
  }, [isSuccess, refetch]);

  if (!IDENTITY_REGISTRY_ADDRESS) {
    return (
      <div className="card">
        <span className="eyebrow">Configuración pendiente</span>
        <p className="muted">
          Falta <code>NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS</code> — despliega los contratos
          primero con <code>pnpm --filter contracts deploy:testnet</code>.
        </p>
      </div>
    );
  }

  if (isCheckingRegistration) {
    return (
      <div className="card">
        <p className="muted">Verificando identidad…</p>
      </div>
    );
  }

  if (isRegistered) {
    return (
      <div className="card">
        <span className="eyebrow">Listo</span>
        <h2>Identidad registrada ✓</h2>
        <p className="muted">Ya eres parte del grafo en vivo.</p>
      </div>
    );
  }

  return (
    <form
      className="card"
      onSubmit={(event) => {
        event.preventDefault();
        writeContract({
          address: IDENTITY_REGISTRY_ADDRESS,
          abi: identityRegistryAbi,
          functionName: "register",
          args: [displayName, ""],
        });
      }}
    >
      <span className="eyebrow">Último paso</span>
      <h2>Únete al grafo</h2>
      <p className="muted">Elige cómo quieres aparecer en la pantalla grande.</p>
      <div className="field">
        <label htmlFor="displayName">Tu nombre</label>
        <input
          id="displayName"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Como quieres aparecer en la pantalla"
          required
          minLength={1}
          maxLength={64}
        />
      </div>
      <button type="submit" disabled={isPending || isConfirming || displayName.trim().length === 0}>
        {isPending || isConfirming ? "Registrando…" : "Unirme al grafo"}
      </button>
      {error && <p className="muted">No se pudo registrar: {error.message}</p>}
    </form>
  );
}
