// App-level shared types. DB row types live in lib/db/types.ts.

export type LeaderboardRow = {
  teamId: string;
  player: string;
  teamName: string;
  total: number;
  rank: number;
};
