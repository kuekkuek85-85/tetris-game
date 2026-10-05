// 기록 저장소 파사드: Firebase 가 설정되어 있으면 Firestore, 아니면 localStorage.
// 저장 실패 시 재시도하고, 끝내 실패하면 localStorage 대기 큐에 보관했다가
// 연결이 회복되면 재전송한다. 재전송 전에도(그리고 원격 읽기 실패 시에도)
// 로컬 대기 기록이 화면에서 사라지지 않도록 병합해 읽는다.

import { getDb, isFirebaseConfigured } from "@/lib/firebase/config";
import type { GameRecord, PlayerAggregate, SaveGameInput } from "./types";
import {
  fsGetAllGames,
  fsGetMyGames,
  fsGetPlayer,
  fsSaveGame,
} from "./firestoreStore";
import {
  localAddPending,
  localGetLeaderboard,
  localGetMyGames,
  localGetPending,
  localGetPlayer,
  localRemovePending,
  localSaveGame,
  toGameRecord,
  type PendingGame,
} from "./localStore";

export type { GameRecord, PlayerAggregate, SaveGameInput };

export interface SaveResult {
  ok: boolean;
  /** 로컬(대기 큐) 폴백으로 저장되었는지 */
  fallback: boolean;
  error?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isRealUid(uid: string | null | undefined): uid is string {
  return !!uid && !uid.startsWith("local-");
}

/**
 * 게임 기록 저장. Firestore 저장은 고정 게임 ID 로 최대 3회 지수 백오프 재시도(멱등).
 * 모두 실패하면 로컬 대기 큐에 보관(수업 중 데이터 유실 방지)하고, 이후 재전송을 시도한다.
 */
export async function saveGame(input: SaveGameInput): Promise<SaveResult> {
  const db = getDb();
  if (!db) {
    const { ok } = localSaveGame(input);
    return { ok, fallback: true, error: ok ? undefined : "로컬 저장에 실패했습니다." };
  }

  const gameId = genId();
  const delays = [500, 1500, 3000];
  let lastError = "";
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      await fsSaveGame(db, input, gameId);
      // 저장 성공 시 밀려 있던 대기 기록도 현재 uid 로 재전송해 본다
      void flushPending(input.uid);
      return { ok: true, fallback: false };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < delays.length) {
        await sleep(delays[attempt]);
      }
    }
  }

  // Firestore 저장 최종 실패 → 로컬 대기 큐 보관
  const { ok } = localAddPending(input);
  return {
    ok,
    fallback: true,
    error: ok ? lastError : "서버·로컬 저장에 모두 실패했습니다.",
  };
}

/**
 * 로컬 대기 큐에 보관된 기록을 Firestore 로 재전송한다.
 * - 각 항목은 "전송 성공 즉시" 큐에서 제거한다. (전송은 되었는데 큐에 남아 있는 사이
 *   동시 실행된 읽기가 원격 집계 + 대기 기록을 이중 계산하는 것을 방지)
 * - 동일 ID 를 재사용해 중복 생성되지 않으며, 원래 플레이 시각(playedAt)을 보존한다.
 * - 익명 인증 실패로 `local-*` uid 로 저장되었던 기록은, 인증이 회복돼 실제 uid 가
 *   주어지면 그 uid 로 재바인딩해 전송한다(보안 규칙의 uid 일치 요건 충족).
 */
export async function flushPending(authUid?: string): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const pending = localGetPending();
  if (pending.length === 0) return 0;

  const rebindUid = isRealUid(authUid) ? authUid : null;

  let flushedCount = 0;
  for (const p of pending) {
    const uid = rebindUid ?? p.uid;
    // 재바인딩할 실제 uid 가 없고 저장된 uid 도 local-* 라면 아직 전송 불가 — 보류
    if (!isRealUid(uid)) break;
    try {
      await fsSaveGame(db, { ...pendingToInput(p), uid }, p.id, p.playedAt);
      localRemovePending([p.id]); // 성공 즉시 제거 → 이중 계산 창 제거
      flushedCount += 1;
    } catch {
      // 하나라도 실패하면 이후 항목은 다음 기회에 재시도
      break;
    }
  }
  return flushedCount;
}

function pendingToInput(p: PendingGame): SaveGameInput {
  return {
    uid: p.uid,
    nickname: p.nickname,
    // 업그레이드 이전에 쌓인 레거시 대기 기록엔 studentId 가 없을 수 있다.
    // undefined 가 그대로 Firestore 에 전달되면 쓰기가 거부되어 큐가 영구 적체되므로 기본값으로 정규화.
    studentId: p.studentId ?? "",
    classId: p.classId ?? "",
    studentNo: p.studentNo ?? null,
    score: p.score,
    lines: p.lines,
    level: p.level,
    durationMs: p.durationMs,
  };
}

function pendingRecords(filter: (p: PendingGame) => boolean): GameRecord[] {
  return localGetPending().filter(filter).map(toGameRecord);
}

function dedupeById(records: GameRecord[]): GameRecord[] {
  const seen = new Set<string>();
  const out: GameRecord[] = [];
  for (const r of records) {
    const key = r.id ?? `${r.uid}-${r.playedAt}-${r.score}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** uid 별 최고 점수 한 건만 남긴다(동점 시 달성 시각 빠른 순). 점수 내림차순 정렬. */
function bestPerUid(games: GameRecord[]): GameRecord[] {
  const best = new Map<string, GameRecord>();
  for (const g of games) {
    const prev = best.get(g.uid);
    if (!prev || g.score > prev.score || (g.score === prev.score && g.playedAt < prev.playedAt)) {
      best.set(g.uid, g);
    }
  }
  return Array.from(best.values()).sort(
    (a, b) => b.score - a.score || a.playedAt - b.playedAt,
  );
}

/**
 * games 전체를 병합해 가져온다(원격 전체 페이지네이션 + 대기, 또는 로컬 + 대기).
 * 점수순 상위 N개로 자르지 않으므로, 저득점 플레이어가 집계에서 누락되지 않는다.
 * classId 가 주어지면 해당 반으로 필터링한다.
 */
async function collectAllGames(classId: string | null): Promise<GameRecord[]> {
  const db = getDb();
  const classFilter = (p: PendingGame) => (classId ? p.classId === classId : true);
  const byClass = (g: GameRecord) => (classId ? g.classId === classId : true);

  let base: GameRecord[];
  if (!db) {
    base = localGetLeaderboard(classId, 100000);
  } else {
    try {
      const remote = await fsGetAllGames(db);
      base = dedupeById([...remote, ...pendingRecords(classFilter)]);
    } catch {
      base = dedupeById([
        ...localGetLeaderboard(classId, 100000),
        ...pendingRecords(classFilter),
      ]);
    }
  }
  return base.filter(byClass);
}

export async function getPlayer(uid: string): Promise<PlayerAggregate | null> {
  const db = getDb();
  if (!db) return localGetPlayer(uid);
  try {
    const remote = await fsGetPlayer(db, uid);
    return foldPendingIntoAggregate(remote, uid);
  } catch {
    // 원격 실패 시에도 로컬 집계 + 대기 기록을 반영
    return foldPendingIntoAggregate(localGetPlayer(uid), uid);
  }
}

/** 아직 서버에 반영되지 않은 대기 기록을 집계에 반영해 대시보드 일관성을 유지한다. */
function foldPendingIntoAggregate(
  remote: PlayerAggregate | null,
  uid: string,
): PlayerAggregate | null {
  const mine = localGetPending().filter((p) => p.uid === uid);
  if (mine.length === 0) return remote;

  const base: PlayerAggregate =
    remote ?? {
      uid,
      nickname: mine[0].nickname,
      studentId: mine[0].studentId ?? "",
      classId: mine[0].classId ?? "",
      studentNo: mine[0].studentNo ?? null,
      bestScore: 0,
      playCount: 0,
      totalLines: 0,
      totalPlayMs: 0,
      createdAt: mine[0].playedAt,
      lastPlayedAt: mine[0].playedAt,
    };

  return mine.reduce<PlayerAggregate>(
    (agg, p) => ({
      ...agg,
      bestScore: Math.max(agg.bestScore, p.score),
      playCount: agg.playCount + 1,
      totalLines: agg.totalLines + p.lines,
      totalPlayMs: agg.totalPlayMs + p.durationMs,
      lastPlayedAt: Math.max(agg.lastPlayedAt, p.playedAt),
    }),
    base,
  );
}

export async function getMyGames(uid: string, max = 10): Promise<GameRecord[]> {
  const db = getDb();
  const merge = (base: GameRecord[]) =>
    dedupeById([...pendingRecords((p) => p.uid === uid), ...base])
      .sort((a, b) => b.playedAt - a.playedAt)
      .slice(0, max);
  if (!db) return localGetMyGames(uid, max);
  try {
    return merge(await fsGetMyGames(db, uid, max));
  } catch {
    return merge(localGetMyGames(uid, max));
  }
}

/**
 * 학급 리더보드: 전체 games 를 플레이어별 최고 기록 1건으로 집계해 상위 maxPlayers 명 반환.
 * 점수순 절단 없이 전체를 집계하므로 저득점 플레이어도 누락되지 않는다.
 */
export async function getPlayerLeaderboard(
  classId: string | null,
  maxPlayers = 50,
): Promise<GameRecord[]> {
  const games = await collectAllGames(classId);
  return bestPerUid(games).slice(0, maxPlayers);
}

/** 교사용 전체 기록: games 컬렉션 전체(+대기 기록)를 playedAt 내림차순으로. */
export async function getAllGames(): Promise<GameRecord[]> {
  const games = await collectAllGames(null);
  return games.slice().sort((a, b) => b.playedAt - a.playedAt);
}

/** 주어진 games 집합에서 uid 의 1-based 순위(없으면 null). best-per-uid 기준. */
function rankOf(games: GameRecord[], uid: string): number | null {
  const ranked = bestPerUid(games);
  const idx = ranked.findIndex((g) => g.uid === uid);
  return idx >= 0 ? idx + 1 : null;
}

export interface MyRanks {
  overall: number | null;
  classRank: number | null;
}

/**
 * 전체 순위와 우리 반 순위를 한 번의 games 조회로 함께 계산한다.
 * (전체를 한 번만 읽고 반 순위는 메모리에서 필터링 — 중복 조회/비용 방지)
 */
export async function getRanks(
  uid: string,
  classId: string | null,
): Promise<MyRanks> {
  const all = await collectAllGames(null);
  return {
    overall: rankOf(all, uid),
    classRank: classId ? rankOf(all.filter((g) => g.classId === classId), uid) : null,
  };
}

export { isFirebaseConfigured };
