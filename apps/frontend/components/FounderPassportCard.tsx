"use client";

import { RELAY_ACTION_TYPES } from "@buildnowbetter/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";

import { postToRelay, randomNonce, relayDomain, signatureDeadline } from "@/lib/relayClient";
import { useMyIdentity } from "@/lib/useMyIdentity";
import { useRelaySnapshot } from "@/lib/useRelaySnapshot";

const FOUNDER_PASSPORT_ADDRESS = process.env.NEXT_PUBLIC_FOUNDER_PASSPORT_ADDRESS as
  | `0x${string}`
  | undefined;

function RegisterProjectForm() {
  const { address } = useAccount();
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
          const deadline = signatureDeadline();
          const message = {
            wallet: address,
            name,
            shortDesc,
            greenfieldURI,
            nonce,
            deadline,
          } as const;
          const signature = await signTypedDataAsync({
            domain: relayDomain(FOUNDER_PASSPORT_ADDRESS),
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
            deadline: deadline.toString(),
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

/**
 * Invites a teammate — it does not add them. Membership needs the invitee's own acceptance
 * (see PendingInvitesCard), so nobody ends up listed on a project they never agreed to join.
 *
 * Gasless like every other write. This used to be the one flow that demanded the attendee hold
 * testnet BNB, which stopped the project lead dead in the middle of the demo.
 */
function InviteTeamMemberForm({
  projectId,
  candidates,
}: {
  projectId: string;
  candidates: { identityId: string; displayName: string }[];
}) {
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const [memberId, setMemberId] = useState("");
  const { signTypedDataAsync } = useSignTypedData();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [invitedName, setInvitedName] = useState<string | undefined>();

  if (!FOUNDER_PASSPORT_ADDRESS || candidates.length === 0) return null;

  return (
    <form
      className="field"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!address || !memberId) return;
        setSubmitError(undefined);
        setIsSubmitting(true);
        try {
          const nonce = randomNonce();
          const deadline = signatureDeadline();
          const message = {
            wallet: address,
            projectId: BigInt(projectId),
            toIdentityId: BigInt(memberId),
            nonce,
            deadline,
          } as const;
          const signature = await signTypedDataAsync({
            domain: relayDomain(FOUNDER_PASSPORT_ADDRESS),
            types: RELAY_ACTION_TYPES.InviteTeamMember,
            primaryType: "InviteTeamMember",
            message,
          });
          await postToRelay("/invite-team-member", {
            wallet: address,
            projectId,
            toIdentityId: memberId,
            nonce: nonce.toString(),
            deadline: deadline.toString(),
            signature,
          });
          setInvitedName(candidates.find((c) => c.identityId === memberId)?.displayName);
          setMemberId("");
          await queryClient.invalidateQueries({ queryKey: ["relay-snapshot"] });
        } catch (error) {
          setSubmitError(error instanceof Error ? error.message : "No se pudo invitar");
        } finally {
          setIsSubmitting(false);
        }
      }}
    >
      <label htmlFor="teamMember">Invitar al equipo</label>
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
      <button type="submit" disabled={isSubmitting || !memberId}>
        {isSubmitting ? "Invitando…" : "Enviar invitación"}
      </button>
      {invitedName && (
        <p className="muted" role="status">
          Invitación enviada a {invitedName}. Se sumará al equipo cuando la acepte.
        </p>
      )}
      {submitError && (
        <p className="muted" role="alert">
          No se pudo invitar: {submitError}
        </p>
      )}
    </form>
  );
}

/** The consent step: only the invitee can put themselves on a team. Gasless. */
function PendingInvitesCard({
  myIdentityId,
  invites,
}: {
  myIdentityId: string;
  invites: { projectId: string; name: string }[];
}) {
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const { signTypedDataAsync } = useSignTypedData();
  const [pendingId, setPendingId] = useState<string | undefined>();
  const [submitError, setSubmitError] = useState<string | undefined>();

  if (!FOUNDER_PASSPORT_ADDRESS || invites.length === 0) return null;

  // An arrow function bound to `const`, not a hoisted function declaration: TS only retains the
  // guard clause's narrowing of the module-level FOUNDER_PASSPORT_ADDRESS across a closure when
  // it can prove the closure isn't reachable before the narrowing takes effect.
  const accept = async (projectId: string) => {
    if (!address) return;
    setSubmitError(undefined);
    setPendingId(projectId);
    try {
      const nonce = randomNonce();
      const deadline = signatureDeadline();
      const signature = await signTypedDataAsync({
        domain: relayDomain(FOUNDER_PASSPORT_ADDRESS),
        types: RELAY_ACTION_TYPES.AcceptTeamInvite,
        primaryType: "AcceptTeamInvite",
        message: { wallet: address, projectId: BigInt(projectId), nonce, deadline } as const,
      });
      await postToRelay("/accept-team-invite", {
        wallet: address,
        projectId,
        nonce: nonce.toString(),
        deadline: deadline.toString(),
        signature,
      });
      await queryClient.invalidateQueries({ queryKey: ["relay-snapshot"] });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "No se pudo aceptar");
    } finally {
      setPendingId(undefined);
    }
  };

  return (
    <div className="card">
      <span className="eyebrow">Invitaciones</span>
      <h2>Te invitaron a un equipo</h2>
      <p className="muted">Solo apareces en un proyecto si tú lo aceptas.</p>
      {invites.map((invite) => (
        <div key={invite.projectId} className="field">
          <span className="name">{invite.name}</span>
          <button
            type="button"
            onClick={() => void accept(invite.projectId)}
            disabled={pendingId !== undefined}
            aria-busy={pendingId === invite.projectId}
          >
            {pendingId === invite.projectId ? "Aceptando…" : "Unirme a este equipo"}
          </button>
        </div>
      ))}
      {submitError && (
        <p className="muted" role="alert">
          {submitError}
        </p>
      )}
    </div>
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
          const deadline = signatureDeadline();
          const message = {
            wallet: address,
            projectId: BigInt(projectId),
            toIdentityId: BigInt(toIdentityId),
            skillTag,
            nonce,
            deadline,
          } as const;
          const signature = await signTypedDataAsync({
            domain: relayDomain(FOUNDER_PASSPORT_ADDRESS),
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
            deadline: deadline.toString(),
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

  // Skip anyone already on the team or with an invite in flight, so the lead can't re-invite
  // (which the contract rejects) and can't invite an existing member.
  const teamCandidates = myProject
    ? snapshot.nodes
        .filter(
          (node) =>
            !myProject.teamMemberIds.includes(node.identityId) &&
            !myProject.invitedIdentityIds.includes(node.identityId),
        )
        .map((node) => ({ identityId: node.identityId, displayName: node.displayName }))
    : [];

  const myInvites = snapshot.projects
    .filter((project) => project.invitedIdentityIds.includes(myIdentityId))
    .map((project) => ({ projectId: project.projectId, name: project.name }));

  const pendingInviteNames = (myProject?.invitedIdentityIds ?? []).map((id) => nodesById.get(id) ?? id);

  return (
    <>
      <PendingInvitesCard myIdentityId={myIdentityId} invites={myInvites} />
      {myProject ? (
        <div className="card">
          <span className="eyebrow">Founder passport</span>
          <h2>{myProject.name}</h2>
          {myProject.shortDesc && <p className="muted">{myProject.shortDesc}</p>}
          <p className="muted">
            Equipo: {myProject.teamMemberIds.map((id) => nodesById.get(id) ?? id).join(", ")}
          </p>
          {pendingInviteNames.length > 0 && (
            <p className="muted">Invitaciones pendientes: {pendingInviteNames.join(", ")}</p>
          )}
          <p className="muted">Endosos de skills: {myProject.endorsementCount}</p>
          <InviteTeamMemberForm projectId={myProject.projectId} candidates={teamCandidates} />
        </div>
      ) : (
        <RegisterProjectForm />
      )}
      <EndorseBuilderForm myIdentityId={myIdentityId} projects={otherProjects} nodesById={nodesById} />
    </>
  );
}
