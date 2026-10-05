// 기록 저장소 파사드: Firebase 가 설정되어 있으면 Firestore, 아니면 localStorage.
// 저장 실패 시 재시도하고, 끝내 실패하면 localStorage 대기 큐에 보관했다가
// 연결이 회복되면 재전송한다. 재전송 전에도 로컬 기록이 화면에서 사라지지 않도록 병합해 읽는다.

import { getDb, isFirebaseConfigured } from "@/lib/firebase/config";
import type { GameRecord, PlayerAggregate, SaveGameInput } from "./types";
import {
  fsGetLeaderboard,
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
      // 저장 성공 시 밀려 있던 대기 기록도 함께 비워본다
      void flushPending();
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
 * 성공한 항목만 큐에서 제거하며, 동일 ID 를 재사용해 중복 생성되지 않는다.
 */
export async function flushPending(): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const pending = localGetPending();
  if (pending.length === 0) return 0;

  const flushed: string[] = [];
  for (const p of pending) {
    try {
      await fsSaveGame(db, pendingToInput(p), p.id);
      flushed.push(p.id);
    } catch {
      // 하나라도 실패하면 이후 항목은 다음 기회에 재시도
      break;
    }
  }
  localRemovePending(flushed);
  return flushed.length;
}

function pendingToInput(p: PendingGame): SaveGameInput {
  return {
    uid: p.uid,
    nickname: p.nickname,
    classId: p.classId,
    studentNo: p.studentNo,
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

export async function getPlayer(uid: string): Promise<PlayerAggregate | null> {
  const db = getDb();
  if (!db) return localGetPlayer(uid);
  try {
    const remote = await fsGetPlayer(db, uid);
    return foldPendingIntoAggregate(remote, uid);
  } catch {
    return localGetPlayer(uid);
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
      classId: mine[0].classId,
      studentNo: mine[0].studentNo,
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
  if (!db) return localGetMyGames(uid, max);
  try {
    const remote = await fsGetMyGames(db, uid, max);
    return dedupeById([...pendingRecords((p) => p.uid === uid), ...remote])
      .sort((a, b) => b.playedAt - a.playedAt)
      .slice(0, max);
  } catch {
    return localGetMyGames(uid, max);
  }
}

export async function getLeaderboard(
  classId: string | null,
  max = 50,
): Promise<GameRecord[]> {
  const db = getDb();
  if (!db) return localGetLeaderboard(classId, max);
  try {
    const remote = await fsGetLeaderboard(db, classId, max);
    const pending = pendingRecords((p) => (classId ? p.classId === classId : true));
    return dedupeById([...remote, ...pending])
      .sort((a, b) => b.score - a.score || a.playedAt - b.playedAt)
      .slice(0, max);
  } catch {
    return localGetLeaderboard(classId, max);
  }
}

/** 교사용 전체 기록: games 컬렉션에서 조회(+대기 기록 병합). */
export async function getAllGames(): Promise<GameRecord[]> {
  const db = getDb();
  if (!db) return localGetLeaderboard(null, 1000);
  try {
    const remote = await fsGetLeaderboard(db, null, 1000);
    return dedupeById([...remote, ...pendingRecords(() => true)]).sort(
      (a, b) => b.playedAt - a.playedAt,
    );
  } catch {
    return localGetLeaderboard(null, 1000);
  }
}

/**
 * 내 순위: games(리더보드) 기준으로 uid 별 최고 점수를 집계해 1-based 순위를 구한다.
 * (players 문서는 보안 규칙상 본인만 읽을 수 있으므로 전체 조회에 쓰지 않는다.)
 */
export async function getMyRank(
  uid: string,
  classId: string | null,
): Promise<number | null> {
  const games = await getLeaderboard(classId, 1000);
  if (games.length === 0) return null;

  const bestByUid = new Map<string, number>();
  for (const g of games) {
    bestByUid.set(g.uid, Math.max(bestByUid.get(g.uid) ?? 0, g.score));
  }
  const ranked = Array.from(bestByUid.entries()).sort((a, b) => b[1] - a[1]);
  const idx = ranked.findIndex(([u]) => u === uid);
  return idx >= 0 ? idx + 1 : null;
}

export { isFirebaseConfigured };
