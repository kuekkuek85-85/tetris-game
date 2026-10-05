import type { GameRecord } from "@/lib/records";

export interface ClassStat {
  classId: string;
  playerCount: number;
  gameCount: number;
  avgScore: number;
  bestScore: number;
}

const keyOf = (classId: string) => classId || "(미지정)";

/**
 * 반별 통계(참여 수·게임 수·평균·최고)를 games 기록만으로 계산한다.
 * 참여 수는 반별 고유 uid 수로 집계한다. (players 컬렉션은 보안 규칙상 전체 조회 불가)
 */
export function computeClassStats(games: GameRecord[]): ClassStat[] {
  const uids = new Map<string, Set<string>>();
  const agg = new Map<string, { sum: number; count: number; best: number }>();

  for (const g of games) {
    const key = keyOf(g.classId);
    if (!uids.has(key)) uids.set(key, new Set());
    uids.get(key)!.add(g.uid);

    const a = agg.get(key) ?? { sum: 0, count: 0, best: 0 };
    a.sum += g.score;
    a.count += 1;
    a.best = Math.max(a.best, g.score);
    agg.set(key, a);
  }

  return Array.from(agg.entries())
    .map(([classId, a]) => ({
      classId,
      playerCount: uids.get(classId)?.size ?? 0,
      gameCount: a.count,
      avgScore: a.count > 0 ? Math.round(a.sum / a.count) : 0,
      bestScore: a.best,
    }))
    .sort((a, b) => a.classId.localeCompare(b.classId, "ko"));
}

/** 전체 참여 학생 수(고유 uid). */
export function countParticipants(games: GameRecord[]): number {
  return new Set(games.map((g) => g.uid)).size;
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
