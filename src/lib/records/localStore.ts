// Firebase 미설정/차단 시 사용하는 localStorage 기반 기록 저장소.
// 학교망에서 Firebase 가 막혀도 수업이 끊기지 않도록 하는 폴백.

import type { GameRecord, PlayerAggregate, SaveGameInput } from "./types";

const GAMES_KEY = "tetris.local.games";
const PLAYERS_KEY = "tetris.local.players";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 실패 무시 */
  }
}

export function localSaveGame(input: SaveGameInput): GameRecord {
  const now = Date.now();
  const record: GameRecord = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
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
  write(GAMES_KEY, games);

  // 집계 갱신
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
  write(PLAYERS_KEY, players);

  return record;
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

export function localGetAllPlayers(): PlayerAggregate[] {
  const players = read<Record<string, PlayerAggregate>>(PLAYERS_KEY, {});
  return Object.values(players);
}

/** 내 순위 (리더보드 상의 1-based 순위). 없으면 null. */
export function localGetMyRank(uid: string, classId: string | null): number | null {
  const players = localGetAllPlayers()
    .filter((p) => (classId ? p.classId === classId : true))
    .sort((a, b) => b.bestScore - a.bestScore);
  const idx = players.findIndex((p) => p.uid === uid);
  return idx >= 0 ? idx + 1 : null;
}
