// Firebase 미설정/차단 시 사용하는 localStorage 기반 기록 저장소.
// 학교망에서 Firebase 가 막혀도 수업이 끊기지 않도록 하는 폴백.

import type { GameRecord, PlayerAggregate, SaveGameInput } from "./types";

const GAMES_KEY = "tetris.local.games";
const PLAYERS_KEY = "tetris.local.players";
// Firebase 가 설정되어 있으나 저장에 실패해 로컬에 임시 보관 중인(아직 서버에 없는) 기록
const PENDING_KEY = "tetris.local.pending";

/** 서버 재전송을 위해 보관하는 대기 기록 (식별용 id/시각 포함) */
export type PendingGame = SaveGameInput & { id: string; playedAt: number };

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** 저장 성공 여부를 반환한다 (호출부가 실패를 사용자에게 알릴 수 있도록). */
function write<T>(key: string, value: T): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function toGameRecord(p: PendingGame): GameRecord {
  return {
    id: p.id,
    uid: p.uid,
    nickname: p.nickname,
    classId: p.classId,
    score: p.score,
    lines: p.lines,
    level: p.level,
    durationMs: p.durationMs,
    playedAt: p.playedAt,
  };
}

/**
 * 로컬 전용 모드의 기본 저장소에 기록을 저장한다.
 * 게임 기록과 집계를 모두 기록하며, 둘 중 하나라도 실패하면 ok:false 를 돌려준다.
 */
export function localSaveGame(input: SaveGameInput): { ok: boolean; record: GameRecord } {
  const now = Date.now();
  const record: GameRecord = {
    id: newId(),
    uid: input.uid,
    nickname: input.nickname,
    classId: input.classId,
    score: input.score,
    lines: input.lines,
    level: input.level,
    durationMs: input.durationMs,
    playedAt: now,
  };

  const games = read<GameRecord[]>(GAMES_KEY, []);
  games.push(record);
  const gamesOk = write(GAMES_KEY, games);

  const players = read<Record<string, PlayerAggregate>>(PLAYERS_KEY, {});
  const prev = players[input.uid];
  players[input.uid] = {
    uid: input.uid,
    nickname: input.nickname,
    classId: input.classId,
    studentNo: input.studentNo,
    bestScore: Math.max(prev?.bestScore ?? 0, input.score),
    playCount: (prev?.playCount ?? 0) + 1,
    totalLines: (prev?.totalLines ?? 0) + input.lines,
    totalPlayMs: (prev?.totalPlayMs ?? 0) + input.durationMs,
    createdAt: prev?.createdAt ?? now,
    lastPlayedAt: now,
  };
  const playersOk = write(PLAYERS_KEY, players);

  return { ok: gamesOk && playersOk, record };
}

export function localGetPlayer(uid: string): PlayerAggregate | null {
  const players = read<Record<string, PlayerAggregate>>(PLAYERS_KEY, {});
  return players[uid] ?? null;
}

export function localGetMyGames(uid: string, max = 10): GameRecord[] {
  return read<GameRecord[]>(GAMES_KEY, [])
    .filter((g) => g.uid === uid)
    .sort((a, b) => b.playedAt - a.playedAt)
    .slice(0, max);
}

export function localGetLeaderboard(classId: string | null, max = 50): GameRecord[] {
  return read<GameRecord[]>(GAMES_KEY, [])
    .filter((g) => (classId ? g.classId === classId : true))
    .sort((a, b) => b.score - a.score || a.playedAt - b.playedAt)
    .slice(0, max);
}

export function localGetAllGames(): GameRecord[] {
  return read<GameRecord[]>(GAMES_KEY, []).sort((a, b) => b.playedAt - a.playedAt);
}

/** 내 순위 (리더보드 상의 1-based 순위). 없으면 null. */
export function localGetMyRank(uid: string, classId: string | null): number | null {
  const players = Object.values(read<Record<string, PlayerAggregate>>(PLAYERS_KEY, {}))
    .filter((p) => (classId ? p.classId === classId : true))
    .sort((a, b) => b.bestScore - a.bestScore);
  const idx = players.findIndex((p) => p.uid === uid);
  return idx >= 0 ? idx + 1 : null;
}

/* ===== 서버 재전송 대기 큐 (Firebase 설정 모드 전용 폴백) ===== */

/** 대기 큐에 기록을 추가한다. localStorage 쓰기 성공 여부를 반환. */
export function localAddPending(input: SaveGameInput): { ok: boolean; pending: PendingGame } {
  const pending: PendingGame = { ...input, id: newId(), playedAt: Date.now() };
  const list = read<PendingGame[]>(PENDING_KEY, []);
  list.push(pending);
  return { ok: write(PENDING_KEY, list), pending };
}

export function localGetPending(): PendingGame[] {
  return read<PendingGame[]>(PENDING_KEY, []);
}

/** 서버 전송에 성공한 대기 기록을 큐에서 제거한다. */
export function localRemovePending(ids: string[]): void {
  if (ids.length === 0) return;
  const remove = new Set(ids);
  const list = read<PendingGame[]>(PENDING_KEY, []).filter((p) => !remove.has(p.id));
  write(PENDING_KEY, list);
}
