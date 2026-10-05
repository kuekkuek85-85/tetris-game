// 익명 식별 + 학번/성명 로컬 보관

const STORAGE_KEYS = {
  localUid: "tetris.localUid",
  name: "tetris.name",
  studentId: "tetris.studentId",
  classId: "tetris.classId",
  studentNo: "tetris.studentNo",
} as const;

export interface PlayerProfile {
  /** 성명(표시 이름) */
  name: string;
  /** 학번 5자리 */
  studentId: string;
  /** 학번에서 추출한 반 식별값 "학년-반" */
  classId: string;
  /** 학번에서 추출한 번호 */
  studentNo: number | null;
}

/** 브라우저 저장소 접근 (SSR 안전) */
function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 저장 실패는 무시 (시크릿 모드 등) */
  }
}

function safeRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* 무시 */
  }
}

/** Firebase 를 못 쓸 때 사용할 로컬 고유 ID (기기별) */
export function getOrCreateLocalUid(): string {
  const existing = safeGet(STORAGE_KEYS.localUid);
  if (existing) return existing;
  const uid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `local-${crypto.randomUUID()}`
      : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  safeSet(STORAGE_KEYS.localUid, uid);
  return uid;
}

export function loadProfile(): PlayerProfile | null {
  const name = safeGet(STORAGE_KEYS.name);
  const studentId = safeGet(STORAGE_KEYS.studentId);
  if (!name || !studentId) return null;
  const studentNoRaw = safeGet(STORAGE_KEYS.studentNo);
  return {
    name,
    studentId,
    classId: safeGet(STORAGE_KEYS.classId) ?? "",
    studentNo: studentNoRaw ? Number(studentNoRaw) : null,
  };
}

export function saveProfile(profile: PlayerProfile): void {
  safeSet(STORAGE_KEYS.name, profile.name);
  safeSet(STORAGE_KEYS.studentId, profile.studentId);
  safeSet(STORAGE_KEYS.classId, profile.classId);
  safeSet(
    STORAGE_KEYS.studentNo,
    profile.studentNo === null ? "" : String(profile.studentNo),
  );
}

/** 저장된 프로필(학번·성명·반·번호)을 지운다. (학생 전환용) */
export function clearProfile(): void {
  safeRemove(STORAGE_KEYS.name);
  safeRemove(STORAGE_KEYS.studentId);
  safeRemove(STORAGE_KEYS.classId);
  safeRemove(STORAGE_KEYS.studentNo);
}

/** 로컬 UID 를 새로 발급한다(기존 것 폐기). 로컬 전용 모드에서 기록이 섞이지 않도록. */
export function rotateLocalUid(): string {
  safeRemove(STORAGE_KEYS.localUid);
  return getOrCreateLocalUid();
}
