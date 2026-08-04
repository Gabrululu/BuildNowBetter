"use client";

import { RELAY_ACTION_TYPES } from "@buildnowbetter/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAccount, useChainId, useSignTypedData } from "wagmi";

import { useMyIdentity } from "@/lib/useMyIdentity";
import { useRelaySnapshot } from "@/lib/useRelaySnapshot";
import { postToRelay, randomNonce, relayDomain } from "@/lib/relayClient";

const SOCIAL_GRAPH_ADDRESS = process.env.NEXT_PUBLIC_SOCIAL_GRAPH_ADDRESS as `0x${string}` | undefined;

export function EndorseCard() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { identityId: myIdentityId } = useMyIdentity();
  const { data: snapshot, refetch } = useRelaySnapshot();
  const queryClient = useQueryClient();

  const { signTypedDataAsync } = useSignTypedData();
  const [targetId, setTargetId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [lastEndorsedId, setLastEndorsedId] = useState<string | undefined>();

  const alreadyEndorsed = useMemo(() => {
    if (!snapshot || !myIdentityId) return new Set<string>();
    return new Set(snapshot.edges.filter((edge) => edge.fromId === myIdentityId).map((edge) => edge.toId));
  }, [snapshot, myIdentityId]);

  const candidates = useMemo(() => {
    if (!snapshot || !myIdentityId) return [];
    return snapshot.nodes.filter((node) => node.identityId !== myIdentityId && !alreadyEndorsed.has(node.identityId));
  }, [snapshot, myIdentityId, alreadyEndorsed]);

  if (!SOCIAL_GRAPH_ADDRESS || !myIdentityId) {
    return null;
  }

  return (
    <form
      className="card"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!address || !targetId) return;
        setSubmitError(undefined);
        setIsSubmitting(true);
        try {
          const nonce = randomNonce();
          const message = {
            wallet: address,
            toIdentityId: BigInt(targetId),
            nonce,
          } as const;
          const signature = await signTypedDataAsync({
            domain: relayDomain(chainId, SOCIAL_GRAPH_ADDRESS),
            types: RELAY_ACTION_TYPES.Endorse,
            primaryType: "Endorse",
            message,
          });
          await postToRelay("/endorse", {
            wallet: address,
            toIdentityId: targetId,
            nonce: nonce.toString(),
            signature,
          });
          setLastEndorsedId(targetId);
          setTargetId("");
          await queryClient.invalidateQueries({ queryKey: ["relay-snapshot"] });
          await refetch();
        } catch (error) {
          setSubmitError(error instanceof Error ? error.message : "No se pudo endosar");
        } finally {
          setIsSubmitting(false);
        }
      }}
    >
      <span className="eyebrow">Grafo social</span>
      <h2>Endosa a otro asistente</h2>
      {candidates.length === 0 ? (
        <p className="muted">Aún no hay nadie más para endosar — vuelve cuando se registren más asistentes.</p>
      ) : (
        <>
          <div className="field">
            <label htmlFor="endorseTarget">Asistente</label>
            <select id="endorseTarget" value={targetId} onChange={(event) => setTargetId(event.target.value)} required>
              <option value="" disabled>
                Elige a quién endosar
              </option>
              {candidates.map((node) => (
                <option key={node.identityId} value={node.identityId}>
                  {node.displayName}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={isSubmitting || !targetId}>
            {isSubmitting ? "Endosando…" : "Endosar"}
          </button>
        </>
      )}
      {lastEndorsedId && !submitError && <p className="muted">Endoso enviado ✓</p>}
      {submitError && <p className="muted">No se pudo endosar: {submitError}</p>}
    </form>
  );
}
