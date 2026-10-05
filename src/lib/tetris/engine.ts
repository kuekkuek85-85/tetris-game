import {
  BOARD_WIDTH,
  BOMB_ROWS,
  ITEM_GAUGE_MAX,
  ITEM_MAX_HELD,
  KICKS_I,
  KICKS_JLSTZ,
  NEXT_COUNT,
  PIECE_SHAPES,
  TOTAL_HEIGHT,
} from "./constants";
import { createBag, refillQueue, type Rng } from "./bag";
import { hardDropScore, levelForLines, lineClearScore, softDropScore } from "./scoring";
import type {
  ActivePiece,
  Board,
  Cell,
  GameState,
  ItemType,
  PieceType,
  Rotation,
} from "./types";

const ITEM_POOL: ItemType[] = ["bomb", "clearLine"];

/** 빈 보드를 만든다 (숨은 버퍼 포함). */
export function createEmptyBoard(): Board {
  return Array.from({ length: TOTAL_HEIGHT }, () =>
    Array.from({ length: BOARD_WIDTH }, () => 0 as Cell),
  );
}

/** 블록의 현재 회전 상태에서 각 칸의 절대 좌표 [x, y] 목록을 구한다. */
export function getPieceCells(piece: ActivePiece): Array<[number, number]> {
  const shape = PIECE_SHAPES[piece.type][piece.rotation];
  return shape.map(([dx, dy]) => [piece.x + dx, piece.y + dy]);
}

/** 해당 블록 배치가 보드와 충돌하는지(벽/바닥/기존 블록) 검사한다. */
export function collides(board: Board, piece: ActivePiece): boolean {
  for (const [x, y] of getPieceCells(piece)) {
    if (x < 0 || x >= BOARD_WIDTH || y >= TOTAL_HEIGHT) {
      return true;
    }
    // y < 0 은 보드 위쪽(스폰 전) — 충돌로 보지 않음
    if (y >= 0 && board[y][x] !== 0) {
      return true;
    }
  }
  return false;
}

/** 블록이 스폰되는 초기 위치를 만든다. */
export function spawnPiece(type: PieceType): ActivePiece {
  // I 블록은 폭이 넓어 중앙 정렬을 위해 x=3, 나머지도 x=3 기준
  return { type, rotation: 0, x: 3, y: 0 };
}

/** 새 게임 상태를 생성한다 (ready 단계). */
export function createInitialState(rng: Rng = Math.random): GameState {
  const { queue, bag } = refillQueue([], createBag(rng), NEXT_COUNT + 1, rng);
  return {
    board: createEmptyBoard(),
    active: null,
    queue,
    bag,
    hold: null,
    holdUsed: false,
    phase: "ready",
    score: 0,
    lines: 0,
    level: 1,
    elapsedMs: 0,
    itemGauge: 0,
    items: [],
  };
}

/** 큐에서 다음 블록을 꺼내 활성 블록으로 만들고, 큐를 보충한다. */
function pullNextPiece(
  state: GameState,
  rng: Rng,
): { active: ActivePiece; queue: PieceType[]; bag: PieceType[] } {
  const queue = [...state.queue];
  const type = queue.shift()!;
  const refilled = refillQueue(queue, state.bag, NEXT_COUNT + 1, rng);
  return {
    active: spawnPiece(type),
    queue: refilled.queue,
    bag: refilled.bag,
  };
}

/** 게임을 시작한다 (새 상태를 만들어 playing 으로 전환). */
export function startGame(rng: Rng = Math.random): GameState {
  const base = createInitialState(rng);
  const { active, queue, bag } = pullNextPiece(base, rng);
  return {
    ...base,
    active,
    queue,
    bag,
    phase: "playing",
  };
}

/** 활성 블록을 (dx, dy) 만큼 이동. 충돌하면 원래 상태 유지(moved=false). */
export function tryMove(
  state: GameState,
  dx: number,
  dy: number,
): { state: GameState; moved: boolean } {
  if (state.phase !== "playing" || !state.active) {
    return { state, moved: false };
  }
  const candidate: ActivePiece = {
    ...state.active,
    x: state.active.x + dx,
    y: state.active.y + dy,
  };
  if (collides(state.board, candidate)) {
    return { state, moved: false };
  }
  return { state: { ...state, active: candidate }, moved: true };
}

/** 월킥 테이블을 사용해 회전을 시도한다. */
export function tryRotate(
  state: GameState,
  direction: 1 | -1,
): { state: GameState; rotated: boolean } {
  if (state.phase !== "playing" || !state.active) {
    return { state, rotated: false };
  }
  const piece = state.active;
  const from = piece.rotation;
  const to = (((from + direction) % 4) + 4) % 4 as Rotation;

  // O 블록은 회전해도 모양이 같으므로 킥 불필요
  const kickTable = piece.type === "I" ? KICKS_I : KICKS_JLSTZ;
  const kicks =
    piece.type === "O"
      ? [[0, 0] as [number, number]]
      : kickTable[`${from}>${to}`] ?? [[0, 0]];

  for (const [dx, dy] of kicks) {
    const candidate: ActivePiece = {
      ...piece,
      rotation: to,
      x: piece.x + dx,
      y: piece.y + dy,
    };
    if (!collides(state.board, candidate)) {
      return { state: { ...state, active: candidate }, rotated: true };
    }
  }
  return { state, rotated: false };
}

/** 소프트 드롭: 한 칸 아래로. 내려가면 1점 추가. */
export function softDrop(state: GameState): GameState {
  const { state: moved, moved: didMove } = tryMove(state, 0, 1);
  if (!didMove) {
    return state;
  }
  return { ...moved, score: moved.score + softDropScore(1) };
}

/** 활성 블록을 보드에 고정하고, 라인 클리어·점수·레벨을 처리한 뒤 다음 블록을 스폰한다. */
export function lockPiece(state: GameState, rng: Rng = Math.random): GameState {
  if (!state.active) return state;

  // 1) 블록을 보드에 기록
  const board = state.board.map((row) => [...row]);
  for (const [x, y] of getPieceCells(state.active)) {
    if (y >= 0 && y < TOTAL_HEIGHT && x >= 0 && x < BOARD_WIDTH) {
      board[y][x] = state.active.type;
    }
  }

  // 2) 꽉 찬 라인 제거
  const remaining = board.filter((row) => row.some((cell) => cell === 0));
  const clearedLines = board.length - remaining.length;
  while (remaining.length < TOTAL_HEIGHT) {
    remaining.unshift(Array.from({ length: BOARD_WIDTH }, () => 0 as Cell));
  }

  // 3) 점수·라인·레벨 갱신
  const totalLines = state.lines + clearedLines;
  const nextLevel = levelForLines(totalLines);
  const gainedScore = lineClearScore(clearedLines, state.level);

  // 아이템 게이지 충전 — 가득 찰 때마다 아이템 1개 획득(보유 상한까지)
  const { gauge, items } = chargeItemGauge(
    state.itemGauge,
    state.items,
    clearedLines,
    rng,
  );

  const afterClear: GameState = {
    ...state,
    board: remaining,
    lines: totalLines,
    level: nextLevel,
    score: state.score + gainedScore,
    holdUsed: false,
    itemGauge: gauge,
    items,
  };

  // 4) 다음 블록 스폰 — 스폰 자리에 공간이 없으면 게임오버
  const { active, queue, bag } = pullNextPiece(afterClear, rng);
  if (collides(afterClear.board, active)) {
    return {
      ...afterClear,
      active: null,
      queue,
      bag,
      phase: "gameover",
    };
  }

  return { ...afterClear, active, queue, bag };
}

/** 현재 블록이 하드 드롭 시 떨어질 수 있는 칸 수를 구한다. */
export function dropDistance(board: Board, piece: ActivePiece): number {
  let distance = 0;
  // 한 칸씩 내려보며 충돌 직전까지의 거리를 센다
  // (보드 높이가 유한하므로 무한 루프 위험 없음)
  while (
    !collides(board, { ...piece, y: piece.y + distance + 1 })
  ) {
    distance += 1;
  }
  return distance;
}

/** 하드 드롭: 바닥까지 즉시 내리고 2점/칸을 더한 뒤 고정한다. */
export function hardDrop(state: GameState, rng: Rng = Math.random): GameState {
  if (state.phase !== "playing" || !state.active) {
    return state;
  }
  const distance = dropDistance(state.board, state.active);
  const dropped: GameState = {
    ...state,
    active: { ...state.active, y: state.active.y + distance },
    score: state.score + hardDropScore(distance),
  };
  return lockPiece(dropped, rng);
}

/** 홀드: 현재 블록을 보관하고, 보관 중이던 블록(또는 다음 블록)으로 교체한다. */
export function holdPiece(state: GameState, rng: Rng = Math.random): GameState {
  if (state.phase !== "playing" || !state.active || state.holdUsed) {
    return state;
  }
  const currentType = state.active.type;

  if (state.hold === null) {
    // 보관함이 비어 있으면: 현재 블록 보관 + 큐에서 새 블록
    const { active, queue, bag } = pullNextPiece(state, rng);
    const held: GameState = {
      ...state,
      active,
      queue,
      bag,
      hold: currentType,
      holdUsed: true,
    };
    // 새 블록이 스폰 자리에서 바로 충돌하면 top-out 처리 (lockPiece 와 동일)
    if (collides(held.board, active)) {
      return { ...held, active: null, phase: "gameover" };
    }
    return held;
  }

  // 보관함과 교체
  const swapped = spawnPiece(state.hold);
  // 교체한 블록이 스폰 자리에서 바로 충돌하면 top-out 처리
  if (collides(state.board, swapped)) {
    return {
      ...state,
      active: null,
      hold: currentType,
      holdUsed: true,
      phase: "gameover",
    };
  }
  return {
    ...state,
    active: swapped,
    hold: currentType,
    holdUsed: true,
  };
}

/** 중력 1틱: 한 칸 내리고, 더 못 내리면 고정한다. */
export function tick(state: GameState, rng: Rng = Math.random): GameState {
  if (state.phase !== "playing" || !state.active) {
    return state;
  }
  const { state: moved, moved: didMove } = tryMove(state, 0, 1);
  if (didMove) {
    return moved;
  }
  return lockPiece(state, rng);
}

/** 일시정지 토글 */
export function togglePause(state: GameState): GameState {
  if (state.phase === "playing") return { ...state, phase: "paused" };
  if (state.phase === "paused") return { ...state, phase: "playing" };
  return state;
}

/** 고스트(착지 예상 위치) 블록을 구한다. 없으면 null. */
export function getGhostPiece(state: GameState): ActivePiece | null {
  if (!state.active) return null;
  const distance = dropDistance(state.board, state.active);
  return { ...state.active, y: state.active.y + distance };
}

/* ===== 아이템 ===== */

/** 빈 줄(모두 0)을 하나 만든다. */
function emptyRow(): Cell[] {
  return Array.from({ length: BOARD_WIDTH }, () => 0 as Cell);
}

/**
 * 게이지를 clearedLines 만큼 충전하고, ITEM_GAUGE_MAX 를 넘길 때마다 아이템을 1개씩 획득한다.
 * 보유 상한(ITEM_MAX_HELD)을 넘으면 더 획득하지 않고 게이지는 상한에서 멈춘다.
 */
export function chargeItemGauge(
  prevGauge: number,
  prevItems: ItemType[],
  clearedLines: number,
  rng: Rng = Math.random,
): { gauge: number; items: ItemType[] } {
  if (clearedLines <= 0) return { gauge: prevGauge, items: prevItems };
  let gauge = prevGauge + clearedLines;
  const items = [...prevItems];
  while (gauge >= ITEM_GAUGE_MAX && items.length < ITEM_MAX_HELD) {
    gauge -= ITEM_GAUGE_MAX;
    items.push(ITEM_POOL[Math.floor(rng() * ITEM_POOL.length)]);
  }
  // 보유 상한에 도달했으면 게이지는 가득 찬 상태로 유지(상한)
  if (items.length >= ITEM_MAX_HELD) {
    gauge = Math.min(gauge, ITEM_GAUGE_MAX);
  }
  return { gauge, items };
}

/** 폭탄: 보드의 "보이는" 바닥 BOMB_ROWS 줄을 제거하고 위를 아래로 내린다. */
export function applyBomb(board: Board): Board {
  const next = board.slice(0, board.length - BOMB_ROWS);
  const removed: Cell[][] = [];
  for (let i = 0; i < BOMB_ROWS; i++) removed.push(emptyRow());
  return [...removed, ...next];
}

/** 가장 많이 채워진 줄(완전히 빈 줄 제외) 하나를 제거하고 위를 아래로 내린다. */
export function applyClearLine(board: Board): Board {
  let targetIndex = -1;
  let maxFilled = 0;
  for (let y = 0; y < board.length; y++) {
    const filled = board[y].reduce<number>((n, c) => (c !== 0 ? n + 1 : n), 0);
    if (filled > maxFilled) {
      maxFilled = filled;
      targetIndex = y;
    }
  }
  if (targetIndex < 0) return board; // 지울 블록이 없음
  const next = board.filter((_, y) => y !== targetIndex);
  next.unshift(emptyRow());
  return next;
}

/**
 * 지정한 슬롯의 아이템 1개를 사용한다. playing 상태에서만, 해당 슬롯에 아이템이 있을 때만 동작.
 * (같은 종류 아이템이 여러 칸에 있을 수 있으므로 종류가 아닌 슬롯 인덱스로 소비한다.)
 */
export function consumeItem(state: GameState, slot: number): GameState {
  if (state.phase !== "playing") return state;
  const item = state.items[slot];
  if (!item) return state;

  const board = item === "bomb" ? applyBomb(state.board) : applyClearLine(state.board);
  const items = [...state.items];
  items.splice(slot, 1);

  // 줄이 아래로 붕괴하면서 기존 보드 셀이 활성 블록 자리로 밀려 내려올 수 있다.
  // 그대로 두면 collides(board, active) 가 참이 되어 다음 낙하/고정에서 보드가 깨지므로,
  // 충돌이 사라질 때까지 활성 블록을 위로 밀어 올려 유효한 위치를 찾는다.
  let active = state.active;
  if (active) {
    let guard = 0;
    while (collides(board, active) && guard < TOTAL_HEIGHT) {
      active = { ...active, y: active.y - 1 };
      guard += 1;
    }
    // 위로 밀어도 블록 일부가 보드 위(y<0)로 벗어나면 보드에 완전히 재진입할 수 없다.
    // (붕괴 후 꼭대기까지 들어찬 경우) 이때는 손상 상태를 남기지 않도록 top-out 으로 처리한다.
    const fullyOnBoard = getPieceCells(active).every(([, y]) => y >= 0);
    if (collides(board, active) || !fullyOnBoard) {
      return { ...state, board, items, active: null, phase: "gameover" };
    }
  }

  return { ...state, board, items, active };
}
