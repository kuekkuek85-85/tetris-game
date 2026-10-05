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

    // 학번은 공개 컬렉션(games)에 저장하지 않는다 (학생 간 노출 방지)
    const studentId = input.studentId ?? "";

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

    // 유효한 학번이 있는 입력만 "신뢰할 수 있는 신원"으로 본다.
    // 학번이 없는 레거시 기록을 재전송할 때는, 기존 players 의 신원 필드
    // (nickname/studentId/classId/studentNo)를 전혀 건드리지 않고 누적 통계만 반영한다.
    const hasIdentity = studentId !== "";
    const identityFields = hasIdentity
      ? {
          nickname: input.nickname,
          studentId,
          classId: input.classId,
          studentNo: input.studentNo,
        }
      : {};

    if (!playerSnap.exists()) {
      // 신규 생성: 가진 신원으로 생성(학번 없으면 studentId 생략)
      tx.set(playerRef, {
        nickname: input.nickname,
        ...(hasIdentity ? { studentId } : {}),
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

    if (alreadyCounted) {
      // 누적치는 그대로 두고, 신뢰할 신원이 있을 때만 표시 정보를 최신화
      if (hasIdentity) tx.update(playerRef, identityFields);
      return;
    }

    const prev = playerSnap.data();
    tx.update(playerRef, {
      ...identityFields, // 레거시(학번 없음)면 신원 필드는 건드리지 않음
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
    studentId: (d.studentId as string) ?? "",
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

/**
 * games 컬렉션 "전체"를 playedAt 내림차순으로 페이지네이션하여 모두 가져온다.
 * (점수순 상위 N개만 가져오면 통계·순위가 왜곡되므로 시간순으로 전부 수집한다.)
 *
 * 인위적 상한을 두지 않고, 마지막 페이지(요청 개수 미만이 돌아오는 시점)까지
 * 커서를 전진시켜 컬렉션을 소진한다. 커서가 매 페이지 전진하므로 반드시 종료된다.
 * 매우 큰 데이터셋에서는 서버측 집계가 더 적합하지만, 수업 규모에서는 전체 조회로 충분하다.
 */
export async function fsGetAllGames(
  db: Firestore,
  pageSize = 500,
): Promise<GameRecord[]> {
  const base = collection(db, GAMES);
  const out: GameRecord[] = [];
  let cursor: QueryDocumentSnapshot<DocumentData> | null = null;

  for (;;) {
    const q: Query<DocumentData> = cursor
      ? query(base, orderBy("playedAt", "desc"), startAfter(cursor), fsLimit(pageSize))
      : query(base, orderBy("playedAt", "desc"), fsLimit(pageSize));
    const snap: QuerySnapshot<DocumentData> = await getDocs(q);
    if (snap.empty) break;
    for (const d of snap.docs) out.push(mapGame(d.id, d.data()));
    if (snap.docs.length < pageSize) break; // 마지막 페이지 → 컬렉션 소진
    cursor = snap.docs[snap.docs.length - 1];
  }
  return out;
}

// 참고: 교사용 통계는 games 컬렉션만으로 계산한다.
// players 컬렉션은 보안 규칙상 본인 문서만 읽을 수 있으므로 전체 조회 함수를 두지 않는다.
