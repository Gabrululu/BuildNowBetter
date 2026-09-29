import type { LeaderboardEntry } from "@buildnowbetter/shared";

export function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  return (
    <aside className="leaderboard">
      <h2>Leaderboard</h2>
      <ol>
        {entries.map((entry) => (
          <li key={entry.identityId}>
            <span className="name">{entry.displayName}</span>
            <span className="score">{entry.score}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
