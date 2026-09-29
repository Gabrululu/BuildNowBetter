import type { FounderProjectSummary, GraphNode } from "@buildnowbetter/shared";

export function ProjectsPanel({ projects, nodes }: { projects: FounderProjectSummary[]; nodes: GraphNode[] }) {
  const nameById = new Map(nodes.map((node) => [node.identityId, node.displayName]));

  return (
    <aside className="projects-panel">
      <h2>Founder passport</h2>
      {projects.length === 0 ? (
        <p className="muted">Todavía no hay proyectos registrados.</p>
      ) : (
        <ul>
          {projects.map((project) => (
            <li key={project.projectId}>
              <span className="name">{project.name}</span>
              {project.shortDesc && <p className="desc">{project.shortDesc}</p>}
              <p className="team">
                {project.teamMemberIds.map((id) => nameById.get(id) ?? id).join(", ")}
              </p>
              <span className="endorsements">{project.endorsementCount} endosos de skills</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
