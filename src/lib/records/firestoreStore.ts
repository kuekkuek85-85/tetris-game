// Firestore 기반 기록 저장소.
// 게임 저장 시 games 문서 추가 + players 집계를 트랜잭션으로 갱신한다.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  Timestamp,
  where,
  type DocumentData,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
} from "firebase/firestore";
import type { GameRecord, PlayerAggregate, SaveGameInput } from "./types";

const GAMES = "games";
const PLAYERS = "players";

function toMs(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number") return value;
  return Date.now();
}

/**
 * games 문서 추가 + players 집계를 하나의 트랜잭션으로 원자적으로 처리한다.
 *
 * gameId 를 명시적으로 받아(재시도 시 동일 ID 재사용) 트랜잭션 안에서 set 하므로,
 * 전송이 중간에 실패해 재시도되어도 같은 문서를 덮어쓸 뿐 중복 생성되지 않는다.
 * 집계는 같은 게임이 두 번 반영되지 않도록 "이미 반영된 게임 ID" 를 함께 기록해 가드한다.
 */
export async function fsSaveGame(
  db: Firestore,
  input: SaveGameInput,
  gameId: string,
  /** 오프라인 기록 재전송 시 원래 플레이 시각(ms)을 보존하기 위한 값 */
  playedAtMs?: number,
): Promise<void> {
  const gameRef = doc(db, GAMES, gameId);
  const playerRef = doc(db, PLAYERS, input.uid);

  await runTransaction(db, async (tx) => {
    // 트랜잭션은 모든 읽기를 쓰기보다 먼저 수행해야 한다
    const playerSnap = await tx.get(playerRef);
    const gameSnap = await tx.get(gameRef);
    // 재전송(playedAtMs 제공) 시 원래 시각 유지, 아니면 서버 시각 사용
    const playedAt =
      playedAtMs != null ? Timestamp.fromMillis(playedAtMs) : serverTimestamp();
    const now = serverTimestamp();

    // 게임 문서(고정 ID) — 재시도 시 덮어쓰기(멱등)
    tx.set(gameRef, {
      uid: input.uid,
      nickname: input.nickname,
      classId: input.classId,
      score: input.score,
      lines: input.lines,
      level: input.level,
      durationMs: input.durationMs,
      playedAt,
    });

    // 이미 이 게임이 집계에 반영되었다면(재시도) 집계는 건너뛴다
    const alreadyCounted = gameSnap.exists();

    if (!playerSnap.exists()) {
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

    const prev = playerSnap.data();
    if (alreadyCounted) {
      // 닉네임/반 등 표시 정보만 최신화하고 누적치는 그대로 둔다
      tx.update(playerRef, {
        nickname: input.nickname,
        classId: input.classId,
        studentNo: input.studentNo,
      });
      return;
    }
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

function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function mapGame(id: string, d: Record<string, unknown>): GameRecord {
  // 보안 규칙으로 타입을 강제하지만, 런타임 크래시 방지를 위해 방어적으로 변환한다.
  return {
    id,
    uid: asString(d.uid),
    nickname: asString(d.nickname),
    classId: asString(d.classId),
    score: asNumber(d.score, 0),
    lines: asNumber(d.lines, 0),
    level: asNumber(d.level, 1),
    durationMs: asNumber(d.durationMs, 0),
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

/**
 * 교사용 통계를 위해 games 컬렉션 전체를 playedAt 내림차순으로 페이지네이션하여 가져온다.
 * (점수순 상위 N개만 가져오면 통계가 왜곡되므로 시간순으로 모두 수집한다.)
 * 폭주 방지를 위한 안전 상한(safetyCap)을 둔다.
 */
export async function fsGetAllGames(
  db: Firestore,
  pageSize = 500,
  safetyCap = 20000,
): Promise<GameRecord[]> {
  const base = collection(db, GAMES);
  const out: GameRecord[] = [];
  let cursor: QueryDocumentSnapshot<DocumentData> | null = null;

  while (out.length < safetyCap) {
    const q: Query<DocumentData> = cursor
      ? query(base, orderBy("playedAt", "desc"), startAfter(cursor), fsLimit(pageSize))
      : query(base, orderBy("playedAt", "desc"), fsLimit(pageSize));
    const snap: QuerySnapshot<DocumentData> = await getDocs(q);
    if (snap.empty) break;
    for (const d of snap.docs) out.push(mapGame(d.id, d.data()));
    if (snap.docs.length < pageSize) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return out;
}

// 참고: 교사용 통계는 games 컬렉션만으로 계산한다.
// players 컬렉션은 보안 규칙상 본인 문서만 읽을 수 있으므로 전체 조회 함수를 두지 않는다.
