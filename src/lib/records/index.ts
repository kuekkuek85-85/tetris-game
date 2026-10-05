// 기록 저장소 파사드: Firebase 가 설정되어 있으면 Firestore, 아니면 localStorage.
// 저장 실패 시 재시도하고, 끝내 실패하면 localStorage 로 폴백한다.

import { getDb, isFirebaseConfigured } from "@/lib/firebase/config";
import type { GameRecord, PlayerAggregate, SaveGameInput } from "./types";
import {
  fsGetAllGames,
  fsGetAllPlayers,
  fsGetLeaderboard,
  fsGetMyGames,
  fsGetPlayer,
  fsSaveGame,
} from "./firestoreStore";
import {
  localGetAllGames,
  localGetAllPlayers,
  localGetLeaderboard,
  localGetMyGames,
  localGetMyRank,
  localGetPlayer,
  localSaveGame,
} from "./localStore";

export type { GameRecord, PlayerAggregate, SaveGameInput };

export interface SaveResult {
  ok: boolean;
  /** 로컬 폴백으로 저장되었는지 */
  fallback: boolean;
  error?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 게임 기록 저장. Firestore 저장은 최대 3회 지수 백오프 재시도.
 * 모두 실패하면 localStorage 에 저장(수업 중 데이터 유실 방지).
 */
export async function saveGame(input: SaveGameInput): Promise<SaveResult> {
  const db = getDb();
  if (!db) {
    localSaveGame(input);
    return { ok: true, fallback: true };
  }

  const delays = [500, 1500, 3000];
  let lastError = "";
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      await fsSaveGame(db, input);
      return { ok: true, fallback: false };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < delays.length) {
        await sleep(delays[attempt]);
      }
    }
  }

  // Firestore 저장 최종 실패 → 로컬 폴백
  localSaveGame(input);
  return { ok: true, fallback: true, error: lastError };
}

export async function getPlayer(uid: string): Promise<PlayerAggregate | null> {
  const db = getDb();
  if (!db) return localGetPlayer(uid);
  try {
    return await fsGetPlayer(db, uid);
  } catch {
    return localGetPlayer(uid);
  }
}

export async function getMyGames(uid: string, max = 10): Promise<GameRecord[]> {
  const db = getDb();
  if (!db) return localGetMyGames(uid, max);
  try {
    return await fsGetMyGames(db, uid, max);
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
    return await fsGetLeaderboard(db, classId, max);
  } catch {
    return localGetLeaderboard(classId, max);
  }
}

export async function getAllGames(): Promise<GameRecord[]> {
  const db = getDb();
  if (!db) return localGetAllGames();
  try {
    return await fsGetAllGames(db);
  } catch {
    return localGetAllGames();
  }
}

export async function getAllPlayers(): Promise<PlayerAggregate[]> {
  const db = getDb();
  if (!db) return localGetAllPlayers();
  try {
    return await fsGetAllPlayers(db);
  } catch {
    return localGetAllPlayers();
  }
}

/** 내 순위 계산: 전체 플레이어를 bestScore 내림차순 정렬한 1-based 순위. */
export async function getMyRank(
  uid: string,
  classId: string | null,
): Promise<number | null> {
  const db = getDb();
  if (!db) return localGetMyRank(uid, classId);
  try {
    const players = await fsGetAllPlayers(db);
    const sorted = players
      .filter((p) => (classId ? p.classId === classId : true))
      .sort((a, b) => b.bestScore - a.bestScore);
    const idx = sorted.findIndex((p) => p.uid === uid);
    return idx >= 0 ? idx + 1 : null;
  } catch {
    return localGetMyRank(uid, classId);
  }
}

export { isFirebaseConfigured };
