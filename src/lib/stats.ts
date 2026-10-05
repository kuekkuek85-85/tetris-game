import type { GameRecord, PlayerAggregate } from "@/lib/records";

export interface ClassStat {
  classId: string;
  playerCount: number;
  gameCount: number;
  avgScore: number;
  bestScore: number;
}

/** 반별 통계(평균·최고·참여 수)를 계산한다. */
export function computeClassStats(
  players: PlayerAggregate[],
  games: GameRecord[],
): ClassStat[] {
  const map = new Map<string, ClassStat>();

  const keyOf = (classId: string) => classId || "(미지정)";

  for (const p of players) {
    const key = keyOf(p.classId);
    const stat = map.get(key) ?? {
      classId: key,
      playerCount: 0,
      gameCount: 0,
      avgScore: 0,
      bestScore: 0,
    };
    stat.playerCount += 1;
    stat.bestScore = Math.max(stat.bestScore, p.bestScore);
    map.set(key, stat);
  }

  // 게임 수 + 평균 점수 (게임 기록 기준)
  const scoreSum = new Map<string, { sum: number; count: number }>();
  for (const g of games) {
    const key = keyOf(g.classId);
    const agg = scoreSum.get(key) ?? { sum: 0, count: 0 };
    agg.sum += g.score;
    agg.count += 1;
    scoreSum.set(key, agg);

    if (!map.has(key)) {
      map.set(key, {
        classId: key,
        playerCount: 0,
        gameCount: 0,
        avgScore: 0,
        bestScore: 0,
      });
    }
    const stat = map.get(key)!;
    stat.gameCount += 1;
    stat.bestScore = Math.max(stat.bestScore, g.score);
  }

  for (const [key, agg] of scoreSum) {
    const stat = map.get(key);
    if (stat) {
      stat.avgScore = agg.count > 0 ? Math.round(agg.sum / agg.count) : 0;
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.classId.localeCompare(b.classId, "ko"),
  );
}

/** 게임 기록을 CSV 문자열로 변환한다. */
export function gamesToCsv(games: GameRecord[]): string {
  const header = ["닉네임", "반", "점수", "라인", "레벨", "플레이시간(ms)", "기록시각"];
  const rows = games.map((g) => [
    csvEscape(g.nickname),
    csvEscape(g.classId),
    String(g.score),
    String(g.lines),
    String(g.level),
    String(g.durationMs),
    new Date(g.playedAt).toISOString(),
  ]);
  return [header, ...rows].map((r) => r.join(",")).join("\n");
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
