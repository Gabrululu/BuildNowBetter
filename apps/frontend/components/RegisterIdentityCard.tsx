"use client";

import { RELAY_ACTION_TYPES } from "@buildnowbetter/shared";
import { useEffect, useState } from "react";
import { useAccount, useSignTypedData, useWaitForTransactionReceipt } from "wagmi";

import { postToRelay, randomNonce, relayDomain, signatureDeadline } from "@/lib/relayClient";
import { useMyIdentity } from "@/lib/useMyIdentity";

const IDENTITY_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS as
  | `0x${string}`
  | undefined;

export function RegisterIdentityCard() {
  const { address } = useAccount();
  const [displayName, setDisplayName] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Deliberately the same hook EndorseCard and FounderPassportCard use, so all three read one
  // shared react-query entry. This card used to own a separate `isRegistered` read and refetch
  // only that: the attendee saw "Identidad registrada ✓" while the endorse and passport cards
  // stayed hidden until a manual page reload, because nothing invalidated `getIdentityId`.
  const { identityId, isLoading: isCheckingRegistration, refetch } = useMyIdentity();
  const isRegistered = Boolean(identityId);

  const { signTypedDataAsync } = useSignTypedData();
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

  const isBusy = isSubmitting || isConfirming;

  return (
    <form
      className="card"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!address) return;
        setSubmitError(undefined);
        setIsSubmitting(true);
        try {
          const nonce = randomNonce();
          const deadline = signatureDeadline();
          const message = {
            wallet: address,
            displayName,
            metadataURI: "",
            nonce,
            deadline,
          } as const;
          const signature = await signTypedDataAsync({
            domain: relayDomain(IDENTITY_REGISTRY_ADDRESS),
            types: RELAY_ACTION_TYPES.RegisterIdentity,
            primaryType: "RegisterIdentity",
            message,
          });
          const { hash } = await postToRelay("/register", {
            wallet: address,
            displayName,
            metadataURI: "",
            nonce: nonce.toString(),
            deadline: deadline.toString(),
            signature,
          });
          setTxHash(hash);
        } catch (error) {
          setSubmitError(error instanceof Error ? error.message : "No se pudo registrar");
        } finally {
          setIsSubmitting(false);
        }
      }}
    >
      <span className="eyebrow">Último paso</span>
      <h2>Únete al grafo</h2>
      <p className="muted">Elige cómo quieres aparecer en la pantalla grande. Sin gas — el relay paga por ti.</p>
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
      <button type="submit" disabled={isBusy || displayName.trim().length === 0}>
        {isBusy ? "Registrando…" : "Unirme al grafo"}
      </button>
      {submitError && <p className="muted">No se pudo registrar: {submitError}</p>}
    </form>
  );
}
