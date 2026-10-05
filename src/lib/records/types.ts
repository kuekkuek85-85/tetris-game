// 기록 저장/조회 공용 타입

/** 한 판의 게임 결과 (games 컬렉션) */
export interface GameRecord {
  id?: string;
  uid: string;
  /** 표시 이름(성명) — 리더보드/대시보드 표시용 */
  nickname: string;
  /** 학번 5자리 (교사용 식별/CSV) */
  studentId: string;
  classId: string;
  score: number;
  lines: number;
  level: number;
  durationMs: number;
  /** 기록 시각 (epoch ms) */
  playedAt: number;
}

/** 플레이어 집계 (players 컬렉션) */
export interface PlayerAggregate {
  uid: string;
  nickname: string;
  studentId: string;
  classId: string;
  studentNo: number | null;
  bestScore: number;
  playCount: number;
  totalLines: number;
  totalPlayMs: number;
  createdAt: number;
  lastPlayedAt: number;
}

/** 새 게임 저장 시 넘기는 입력 */
export interface SaveGameInput {
  uid: string;
  /** 성명(표시 이름) */
  nickname: string;
  /** 학번 5자리 */
  studentId: string;
  classId: string;
  studentNo: number | null;
  score: number;
  lines: number;
  level: number;
  durationMs: number;
}
