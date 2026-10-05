// 익명 식별 + 닉네임/반/번호 로컬 보관

const STORAGE_KEYS = {
  localUid: "tetris.localUid",
  nickname: "tetris.nickname",
  classId: "tetris.classId",
  studentNo: "tetris.studentNo",
} as const;

export interface PlayerProfile {
  nickname: string;
  classId: string;
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
  const nickname = safeGet(STORAGE_KEYS.nickname);
  if (!nickname) return null;
  const studentNoRaw = safeGet(STORAGE_KEYS.studentNo);
  return {
    nickname,
    classId: safeGet(STORAGE_KEYS.classId) ?? "",
    studentNo: studentNoRaw ? Number(studentNoRaw) : null,
  };
}

export function saveProfile(profile: PlayerProfile): void {
  safeSet(STORAGE_KEYS.nickname, profile.nickname);
  safeSet(STORAGE_KEYS.classId, profile.classId);
  safeSet(
    STORAGE_KEYS.studentNo,
    profile.studentNo === null ? "" : String(profile.studentNo),
  );
}
