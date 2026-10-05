import { LINES_PER_LEVEL } from "./constants";

/** 라인 클리어 점수표 (PRD 5절 기준): 레벨 배수 적용 전 기본 점수 */
const LINE_SCORE_BASE = [0, 100, 300, 500, 800] as const;

/** 지운 라인 수 + 현재 레벨로 획득 점수를 계산한다. */
export function lineClearScore(clearedLines: number, level: number): number {
  const base = LINE_SCORE_BASE[clearedLines] ?? 0;
  return base * level;
}

/** 소프트 드롭: 1점/칸 */
export function softDropScore(cells: number): number {
  return Math.max(0, cells) * 1;
}

/** 하드 드롭: 2점/칸 */
export function hardDropScore(cells: number): number {
  return Math.max(0, cells) * 2;
}

/** 누적 삭제 라인 수에 해당하는 레벨 (LINES_PER_LEVEL 줄마다 +1, 1부터 시작) */
export function levelForLines(totalLines: number): number {
  return Math.floor(totalLines / LINES_PER_LEVEL) + 1;
}
