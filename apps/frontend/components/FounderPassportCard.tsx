"use client";

import { RELAY_ACTION_TYPES, founderPassportAbi } from "@buildnowbetter/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useSignTypedData,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { postToRelay, randomNonce, relayDomain } from "@/lib/relayClient";
import { useMyIdentity } from "@/lib/useMyIdentity";
import { useRelaySnapshot } from "@/lib/useRelaySnapshot";

const FOUNDER_PASSPORT_ADDRESS = process.env.NEXT_PUBLIC_FOUNDER_PASSPORT_ADDRESS as
  | `0x${string}`
  | undefined;

function RegisterProjectForm() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { signTypedDataAsync } = useSignTypedData();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [shortDesc, setShortDesc] = useState("");
  const [greenfieldURI, setGreenfieldURI] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>();

  if (!FOUNDER_PASSPORT_ADDRESS) return null;

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
          const message = {
            wallet: address,
            name,
            shortDesc,
            greenfieldURI,
            nonce,
          } as const;
          const signature = await signTypedDataAsync({
            domain: relayDomain(chainId, FOUNDER_PASSPORT_ADDRESS),
            types: RELAY_ACTION_TYPES.RegisterProject,
            primaryType: "RegisterProject",
            message,
          });
          await postToRelay("/register-project", {
            wallet: address,
            name,
            shortDesc,
            greenfieldURI,
            nonce: nonce.toString(),
            signature,
          });
          await queryClient.invalidateQueries({ queryKey: ["relay-snapshot"] });
        } catch (error) {
          setSubmitError(error instanceof Error ? error.message : "No se pudo registrar el proyecto");
        } finally {
          setIsSubmitting(false);
        }
      }}
    >
      <span className="eyebrow">Founder passport</span>
      <h2>Registra tu proyecto</h2>
      <p className="muted">Tu CV de builder colaborativo para este hackathon. Sin gas.</p>
      <div className="field">
        <label htmlFor="projectName">Nombre del proyecto</label>
        <input
          id="projectName"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="projectDesc">Descripción corta</label>
        <textarea
          id="projectDesc"
          value={shortDesc}
          onChange={(event) => setShortDesc(event.target.value)}
          maxLength={280}
          rows={3}
        />
      </div>
      <div className="field">
        <label htmlFor="projectMedia">Link de media (opcional)</label>
        <input
          id="projectMedia"
          type="url"
          value={greenfieldURI}
          onChange={(event) => setGreenfieldURI(event.target.value)}
          placeholder="Foto, repo, demo — sube el archivo a Greenfield y pega el link aquí"
          maxLength={512}
        />
      </div>
      <button type="submit" disabled={isSubmitting || name.trim().length === 0}>
        {isSubmitting ? "Registrando…" : "Registrar proyecto"}
      </button>
      {submitError && <p className="muted">No se pudo registrar: {submitError}</p>}
    </form>
  );
}

function AddTeamMemberForm({
  projectId,
  candidates,
}: {
  projectId: string;
  candidates: { identityId: string; displayName: string }[];
}) {
  const queryClient = useQueryClient();
  const [memberId, setMemberId] = useState("");
  const { writeContractAsync, isPending } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [submitError, setSubmitError] = useState<string | undefined>();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess) {
      void queryClient.invalidateQueries({ queryKey: ["relay-snapshot"] });
    }
  }, [isSuccess, queryClient]);

  if (!FOUNDER_PASSPORT_ADDRESS || candidates.length === 0) return null;

  return (
    <form
      className="field"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!memberId) return;
        setSubmitError(undefined);
        try {
          const hash = await writeContractAsync({
            address: FOUNDER_PASSPORT_ADDRESS,
            abi: founderPassportAbi,
            functionName: "addTeamMember",
            args: [BigInt(projectId), BigInt(memberId)],
          });
          setTxHash(hash);
          setMemberId("");
        } catch (error) {
          setSubmitError(error instanceof Error ? error.message : "No se pudo agregar");
        }
      }}
    >
      <label htmlFor="teamMember">Agregar miembro de equipo</label>
      <select id="teamMember" value={memberId} onChange={(event) => setMemberId(event.target.value)} required>
        <option value="" disabled>
          Elige a un asistente
        </option>
        {candidates.map((node) => (
          <option key={node.identityId} value={node.identityId}>
            {node.displayName}
          </option>
        ))}
      </select>
      <button type="submit" disabled={isPending || isConfirming || !memberId}>
        {isPending || isConfirming ? "Agregando…" : "Agregar (requiere gas de tu wallet)"}
      </button>
      {submitError && <p className="muted">No se pudo agregar: {submitError}</p>}
    </form>
  );
}

function EndorseBuilderForm({
  myIdentityId,
  projects,
  nodesById,
}: {
  myIdentityId: string;
  projects: { projectId: string; name: string; teamMemberIds: string[] }[];
  nodesById: Map<string, string>;
}) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { signTypedDataAsync } = useSignTypedData();
  const queryClient = useQueryClient();

  const [projectId, setProjectId] = useState("");
  const [toIdentityId, setToIdentityId] = useState("");
  const [skillTag, setSkillTag] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>();

  const selectedProject = projects.find((project) => project.projectId === projectId);
  const targets = (selectedProject?.teamMemberIds ?? []).filter((id) => id !== myIdentityId);

  if (!FOUNDER_PASSPORT_ADDRESS || projects.length === 0) return null;

  return (
    <form
      className="card"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!address || !projectId || !toIdentityId) return;
        setSubmitError(undefined);
        setIsSubmitting(true);
        try {
          const nonce = randomNonce();
          const message = {
            wallet: address,
            projectId: BigInt(projectId),
            toIdentityId: BigInt(toIdentityId),
            skillTag,
            nonce,
          } as const;
          const signature = await signTypedDataAsync({
            domain: relayDomain(chainId, FOUNDER_PASSPORT_ADDRESS),
            types: RELAY_ACTION_TYPES.EndorseBuilder,
            primaryType: "EndorseBuilder",
            message,
          });
          await postToRelay("/endorse-builder", {
            wallet: address,
            projectId,
            toIdentityId,
            skillTag,
            nonce: nonce.toString(),
            signature,
          });
          setToIdentityId("");
          setSkillTag("");
          await queryClient.invalidateQueries({ queryKey: ["relay-snapshot"] });
        } catch (error) {
          setSubmitError(error instanceof Error ? error.message : "No se pudo endosar");
        } finally {
          setIsSubmitting(false);
        }
      }}
    >
      <span className="eyebrow">Founder passport</span>
      <h2>Endosa una skill</h2>
      <div className="field">
        <label htmlFor="skillProject">Proyecto</label>
        <select
          id="skillProject"
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value);
            setToIdentityId("");
          }}
          required
        >
          <option value="" disabled>
            Elige un proyecto
          </option>
          {projects.map((project) => (
            <option key={project.projectId} value={project.projectId}>
              {project.name}
            </option>
          ))}
        </select>
      </div>
      {projectId && (
        <div className="field">
          <label htmlFor="skillTarget">Builder</label>
          <select
            id="skillTarget"
            value={toIdentityId}
            onChange={(event) => setToIdentityId(event.target.value)}
            required
          >
            <option value="" disabled>
              Elige a quién endosar
            </option>
            {targets.map((id) => (
              <option key={id} value={id}>
                {nodesById.get(id) ?? id}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label htmlFor="skillTag">Skill</label>
        <input
          id="skillTag"
          value={skillTag}
          onChange={(event) => setSkillTag(event.target.value)}
          placeholder="p. ej. smart contracts, diseño, pitch"
          maxLength={32}
          required
        />
      </div>
      <button type="submit" disabled={isSubmitting || !projectId || !toIdentityId || !skillTag}>
        {isSubmitting ? "Endosando…" : "Endosar skill"}
      </button>
      {submitError && <p className="muted">No se pudo endosar: {submitError}</p>}
    </form>
  );
}

export function FounderPassportCard() {
  const { identityId: myIdentityId } = useMyIdentity();
  const { data: snapshot } = useRelaySnapshot();

  const nodesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of snapshot?.nodes ?? []) map.set(node.identityId, node.displayName);
    return map;
  }, [snapshot]);

  if (!FOUNDER_PASSPORT_ADDRESS || !myIdentityId || !snapshot) {
    return null;
  }

  const myProject = snapshot.projects.find((project) => project.leadIdentityId === myIdentityId);
  const otherProjects = snapshot.projects.filter((project) => project.teamMemberIds.length > 0);

  const teamCandidates = myProject
    ? snapshot.nodes
        .filter((node) => !myProject.teamMemberIds.includes(node.identityId))
        .map((node) => ({ identityId: node.identityId, displayName: node.displayName }))
    : [];

  return (
    <>
      {myProject ? (
        <div className="card">
          <span className="eyebrow">Founder passport</span>
          <h2>{myProject.name}</h2>
          {myProject.shortDesc && <p className="muted">{myProject.shortDesc}</p>}
          <p className="muted">
            Equipo: {myProject.teamMemberIds.map((id) => nodesById.get(id) ?? id).join(", ")}
          </p>
          <p className="muted">Endosos de skills: {myProject.endorsementCount}</p>
          <AddTeamMemberForm projectId={myProject.projectId} candidates={teamCandidates} />
        </div>
      ) : (
        <RegisterProjectForm />
      )}
      <EndorseBuilderForm myIdentityId={myIdentityId} projects={otherProjects} nodesById={nodesById} />
    </>
  );
}
