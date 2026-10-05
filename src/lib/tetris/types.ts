// 테트리스 핵심 타입 정의

/** 7종 표준 테트로미노 종류 */
export type PieceType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

/** 셀 값: 0 = 빈칸, PieceType = 해당 블록 색 */
export type Cell = 0 | PieceType;

/** 게임 보드 (행 우선, board[y][x]) */
export type Board = Cell[][];

/** 회전 상태 0,1,2,3 (0 = 스폰, 시계방향으로 증가) */
export type Rotation = 0 | 1 | 2 | 3;

/** 현재 떨어지는 블록 */
export interface ActivePiece {
  type: PieceType;
  rotation: Rotation;
  /** 블록 바운딩 박스의 좌상단 x (열) */
  x: number;
  /** 블록 바운딩 박스의 좌상단 y (행) */
  y: number;
}

export type GamePhase = "ready" | "playing" | "paused" | "gameover";

/** 사용 가능한 아이템 종류 */
export type ItemType = "bomb" | "clearLine";

export interface GameState {
  board: Board;
  active: ActivePiece | null;
  /** 다음에 나올 블록들 (앞에서부터 소비) */
  queue: PieceType[];
  /** 현재 7-bag 에 남은 블록들 */
  bag: PieceType[];
  hold: PieceType | null;
  /** 이번 블록에서 홀드를 이미 사용했는지 */
  holdUsed: boolean;
  phase: GamePhase;
  score: number;
  lines: number;
  level: number;
  /** 누적 경과 시간(ms) — 일시정지 시간은 제외 */
  elapsedMs: number;
  /** 아이템 게이지(0~ITEM_GAUGE_MAX). 라인 클리어로 충전되고 가득 차면 아이템 획득 */
  itemGauge: number;
  /** 보유 중인 아이템들 (최대 ITEM_MAX_HELD) */
  items: ItemType[];
}

/** 라인 클리어 결과 요약 (점수 계산용) */
export interface ClearResult {
  clearedLines: number;
}
