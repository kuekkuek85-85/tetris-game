import type { PieceType, Rotation } from "./types";

export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;
/** 블록이 스폰될 때 머무는, 화면 위쪽의 숨은 버퍼 행 수 */
export const SPAWN_BUFFER = 2;
export const TOTAL_HEIGHT = BOARD_HEIGHT + SPAWN_BUFFER;

export const PIECE_TYPES: PieceType[] = ["I", "O", "T", "S", "Z", "J", "L"];

/**
 * 각 블록의 4개 회전 상태 좌표.
 * 각 상태는 4x4(또는 I/O 전용) 바운딩 박스 안의 채워진 칸 [x, y] 목록.
 * SRS(Super Rotation System) 기준 배치를 따른다.
 */
export const PIECE_SHAPES: Record<PieceType, Array<Array<[number, number]>>> = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  O: [
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
  ],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
};

/** 블록별 색상 (CSS 변수와 매칭). 색각 보조를 위해 명도 차이를 둠. */
export const PIECE_COLORS: Record<PieceType, string> = {
  I: "#2dd4ff", // 밝은 청록
  O: "#ffd500", // 노랑
  T: "#b05cff", // 보라
  S: "#2ecc71", // 초록
  Z: "#ff4d5e", // 빨강
  J: "#3b6bff", // 파랑
  L: "#ff9436", // 주황
};

/** 색각 보조용 패턴 기호 (색만으로 구분하지 않도록) */
export const PIECE_GLYPHS: Record<PieceType, string> = {
  I: "I",
  O: "O",
  T: "T",
  S: "S",
  Z: "Z",
  J: "J",
  L: "L",
};

/**
 * SRS 월킥 오프셋 테이블.
 * 키: "출발회전>도착회전". 각 항목은 시도할 [dx, dy] 후보 (좌표계: y 아래로 증가).
 */
type KickTable = Record<string, Array<[number, number]>>;

// J, L, S, T, Z 공용 월킥 (SRS 표준)
export const KICKS_JLSTZ: KickTable = {
  "0>1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "1>0": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "1>2": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "2>1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "2>3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "3>2": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "3>0": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "0>3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};

// I 블록 전용 월킥 (SRS 표준)
export const KICKS_I: KickTable = {
  "0>1": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "1>0": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "1>2": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  "2>1": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "2>3": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "3>2": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "3>0": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "0>3": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

/** 레벨 1의 낙하 간격(ms). 값이 작을수록 처음부터 빠르다. */
export const GRAVITY_BASE_MS = 650;
/** 레벨이 1 오를 때 낙하 간격에 곱하는 가속 계수(작을수록 급가속). */
export const GRAVITY_DECAY = 0.8;
/** 낙하 간격 하한(ms). 이보다 더 빨라지지 않는다. */
export const GRAVITY_MIN_MS = 50;

/** 레벨당 블록이 한 칸 떨어지는 간격(ms). 레벨이 오를수록 빨라진다. */
export function gravityIntervalMs(level: number): number {
  const interval = GRAVITY_BASE_MS * Math.pow(GRAVITY_DECAY, Math.max(0, level - 1));
  return Math.max(GRAVITY_MIN_MS, Math.round(interval));
}

/** 다음 블록 미리보기 개수 */
export const NEXT_COUNT = 5;

/** 레벨 상승에 필요한 라인 수 */
export const LINES_PER_LEVEL = 8;

/** 아이템 게이지가 가득 차는 값(지운 라인 누적). 도달 시 아이템 1개 획득 */
export const ITEM_GAUGE_MAX = 8;
/** 동시에 보유할 수 있는 아이템 최대 수 */
export const ITEM_MAX_HELD = 3;
/** 폭탄이 제거하는 바닥 줄 수 */
export const BOMB_ROWS = 2;

/** 아이템 표시 정보 */
export const ITEM_INFO: Record<
  import("./types").ItemType,
  { label: string; glyph: string; hint: string }
> = {
  bomb: { label: "폭탄", glyph: "💣", hint: "바닥 2줄 제거" },
  clearLine: { label: "라인 소거", glyph: "✂️", hint: "가장 찬 줄 제거" },
};

export const ROTATIONS: Rotation[] = [0, 1, 2, 3];
