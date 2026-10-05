// Firestore 기반 기록 저장소.
// 게임 저장 시 games 문서 추가 + players 집계를 트랜잭션으로 갱신한다.

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  type Firestore,
} from "firebase/firestore";
import type { GameRecord, PlayerAggregate, SaveGameInput } from "./types";

const GAMES = "games";
const PLAYERS = "players";

function toMs(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number") return value;
  return Date.now();
}

/** games 문서 추가 + players 집계 트랜잭션 갱신 */
export async function fsSaveGame(
  db: Firestore,
  input: SaveGameInput,
): Promise<void> {
  // 1) 개별 게임 기록 추가
  await addDoc(collection(db, GAMES), {
    uid: input.uid,
    nickname: input.nickname,
    classId: input.classId,
    score: input.score,
    lines: input.lines,
    level: input.level,
    durationMs: input.durationMs,
    playedAt: serverTimestamp(),
  });

  // 2) players 집계 트랜잭션 (bestScore/playCount/누적치 갱신)
  const playerRef = doc(db, PLAYERS, input.uid);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(playerRef);
    const now = serverTimestamp();
    if (!snap.exists()) {
      tx.set(playerRef, {
        nickname: input.nickname,
        classId: input.classId,
        studentNo: input.studentNo,
        bestScore: input.score,
        playCount: 1,
        totalLines: input.lines,
        totalPlayMs: input.durationMs,
        createdAt: now,
        lastPlayedAt: now,
      });
      return;
    }
    const prev = snap.data();
    tx.update(playerRef, {
      nickname: input.nickname,
      classId: input.classId,
      studentNo: input.studentNo,
      bestScore: Math.max((prev.bestScore as number) ?? 0, input.score),
      playCount: ((prev.playCount as number) ?? 0) + 1,
      totalLines: ((prev.totalLines as number) ?? 0) + input.lines,
      totalPlayMs: ((prev.totalPlayMs as number) ?? 0) + input.durationMs,
      lastPlayedAt: now,
    });
  });
}

export async function fsGetPlayer(
  db: Firestore,
  uid: string,
): Promise<PlayerAggregate | null> {
  const snap = await getDoc(doc(db, PLAYERS, uid));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    uid,
    nickname: (d.nickname as string) ?? "",
    classId: (d.classId as string) ?? "",
    studentNo: (d.studentNo as number | null) ?? null,
    bestScore: (d.bestScore as number) ?? 0,
    playCount: (d.playCount as number) ?? 0,
    totalLines: (d.totalLines as number) ?? 0,
    totalPlayMs: (d.totalPlayMs as number) ?? 0,
    createdAt: toMs(d.createdAt),
    lastPlayedAt: toMs(d.lastPlayedAt),
  };
}

function mapGame(id: string, d: Record<string, unknown>): GameRecord {
  return {
    id,
    uid: (d.uid as string) ?? "",
    nickname: (d.nickname as string) ?? "",
    classId: (d.classId as string) ?? "",
    score: (d.score as number) ?? 0,
    lines: (d.lines as number) ?? 0,
    level: (d.level as number) ?? 1,
    durationMs: (d.durationMs as number) ?? 0,
    playedAt: toMs(d.playedAt),
  };
}

export async function fsGetMyGames(
  db: Firestore,
  uid: string,
  max = 10,
): Promise<GameRecord[]> {
  const q = query(
    collection(db, GAMES),
    where("uid", "==", uid),
    orderBy("playedAt", "desc"),
    fsLimit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((doc) => mapGame(doc.id, doc.data()));
}

export async function fsGetLeaderboard(
  db: Firestore,
  classId: string | null,
  max = 50,
): Promise<GameRecord[]> {
  const base = collection(db, GAMES);
  const q = classId
    ? query(
        base,
        where("classId", "==", classId),
        orderBy("score", "desc"),
        fsLimit(max),
      )
    : query(base, orderBy("score", "desc"), fsLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map((doc) => mapGame(doc.id, doc.data()));
}

export async function fsGetAllGames(db: Firestore, max = 500): Promise<GameRecord[]> {
  const q = query(collection(db, GAMES), orderBy("playedAt", "desc"), fsLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map((doc) => mapGame(doc.id, doc.data()));
}

export async function fsGetAllPlayers(db: Firestore): Promise<PlayerAggregate[]> {
  const snap = await getDocs(collection(db, PLAYERS));
  return snap.docs.map((docSnap) => {
    const d = docSnap.data();
    return {
      uid: docSnap.id,
      nickname: (d.nickname as string) ?? "",
      classId: (d.classId as string) ?? "",
      studentNo: (d.studentNo as number | null) ?? null,
      bestScore: (d.bestScore as number) ?? 0,
      playCount: (d.playCount as number) ?? 0,
      totalLines: (d.totalLines as number) ?? 0,
      totalPlayMs: (d.totalPlayMs as number) ?? 0,
      createdAt: toMs(d.createdAt),
      lastPlayedAt: toMs(d.lastPlayedAt),
    };
  });
}
