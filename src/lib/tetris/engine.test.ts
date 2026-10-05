import { describe, expect, it } from "vitest";
import {
  BOARD_WIDTH,
  ITEM_GAUGE_MAX,
  ITEM_MAX_HELD,
  LINES_PER_LEVEL,
  TOTAL_HEIGHT,
} from "./constants";
import {
  applyBomb,
  applyClearLine,
  chargeItemGauge,
  collides,
  createEmptyBoard,
  createInitialState,
  dropDistance,
  getPieceCells,
  hardDrop,
  holdPiece,
  lockPiece,
  startGame,
  tryMove,
  tryRotate,
  consumeItem,
} from "./engine";
import { createBag, refillQueue } from "./bag";
import { levelForLines, lineClearScore } from "./scoring";
import type { ActivePiece, Board, Cell, ItemType, PieceType } from "./types";

/** 결정적 테스트를 위한 간단한 시드 RNG */
function seededRng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe("7-bag", () => {
  it("한 가방은 7종을 정확히 한 번씩 포함한다", () => {
    const bag = createBag(seededRng(1));
    expect(bag).toHaveLength(7);
    expect(new Set(bag)).toEqual(new Set(["I", "O", "T", "S", "Z", "J", "L"]));
  });

  it("refillQueue 는 최소 개수를 채우고 편중 없이 가방을 소비한다", () => {
    const { queue } = refillQueue([], [], 14, seededRng(2));
    expect(queue).toHaveLength(14);
    // 처음 7개와 다음 7개는 각각 7종을 모두 포함
    expect(new Set(queue.slice(0, 7)).size).toBe(7);
    expect(new Set(queue.slice(7, 14)).size).toBe(7);
  });
});

describe("scoring / level", () => {
  it("라인 클리어 점수는 레벨 배수를 적용한다", () => {
    expect(lineClearScore(1, 1)).toBe(100);
    expect(lineClearScore(2, 2)).toBe(600);
    expect(lineClearScore(3, 3)).toBe(1500);
    expect(lineClearScore(4, 5)).toBe(4000);
    expect(lineClearScore(0, 9)).toBe(0);
  });

  it("레벨은 10줄마다 1씩 오른다", () => {
    expect(levelForLines(0)).toBe(1);
    expect(levelForLines(9)).toBe(1);
    expect(levelForLines(LINES_PER_LEVEL)).toBe(2);
    expect(levelForLines(25)).toBe(3);
  });
});

describe("collision", () => {
  it("벽과 바닥을 벗어나면 충돌이다", () => {
    const board = createEmptyBoard();
    const piece: ActivePiece = { type: "O", rotation: 0, x: -2, y: 0 };
    expect(collides(board, piece)).toBe(true);

    const bottom: ActivePiece = { type: "O", rotation: 0, x: 0, y: TOTAL_HEIGHT };
    expect(collides(board, bottom)).toBe(true);
  });

  it("보드 위쪽(y<0) 은 충돌로 보지 않는다", () => {
    const board = createEmptyBoard();
    const piece: ActivePiece = { type: "I", rotation: 0, x: 3, y: -1 };
    expect(collides(board, piece)).toBe(false);
  });
});

describe("movement & rotation", () => {
  it("좌우 이동은 충돌이 없을 때만 적용된다", () => {
    const state = startGame(seededRng(3));
    const left = tryMove(state, -1, 0);
    expect(left.moved).toBe(true);
    expect(left.state.active!.x).toBe(state.active!.x - 1);
  });

  it("회전은 활성 블록의 rotation 을 바꾼다", () => {
    const state = startGame(seededRng(4));
    const rotated = tryRotate(state, 1);
    if (state.active!.type !== "O") {
      expect(rotated.rotated).toBe(true);
      expect(rotated.state.active!.rotation).toBe(1);
    }
  });
});

describe("line clear", () => {
  it("꽉 찬 줄을 지우고 점수를 올린다", () => {
    const board: Board = createEmptyBoard();
    // 맨 아래 줄을 한 칸만 비워두고 채운다
    const bottom = TOTAL_HEIGHT - 1;
    for (let x = 0; x < BOARD_WIDTH; x++) {
      board[bottom][x] = x === 4 ? (0 as Cell) : ("I" as PieceType);
    }
    // O 블록을 빈 칸 위에 놓아 그 칸을 채운 뒤 lock → 줄 삭제
    const state = {
      ...createInitialState(seededRng(5)),
      board,
      active: { type: "O", rotation: 0, x: 3, y: bottom - 1 } as ActivePiece,
      phase: "playing" as const,
      level: 1,
    };
    const after = lockPiece(state, seededRng(5));
    // 한 줄이 지워졌는지 (또는 그 이상)
    expect(after.lines).toBeGreaterThanOrEqual(1);
    expect(after.score).toBeGreaterThanOrEqual(100);
  });
});

describe("hard drop & ghost distance", () => {
  it("빈 보드에서 하드 드롭 거리는 바닥까지다", () => {
    const board = createEmptyBoard();
    const piece: ActivePiece = { type: "O", rotation: 0, x: 3, y: 0 };
    const distance = dropDistance(board, piece);
    // O 블록의 가장 아래 칸이 바닥에 닿는 거리
    const lowestY = Math.max(...getPieceCells(piece).map(([, y]) => y));
    expect(distance).toBe(TOTAL_HEIGHT - 1 - lowestY);
  });

  it("하드 드롭은 점수를 더하고 다음 블록을 스폰한다", () => {
    const state = startGame(seededRng(6));
    const firstType = state.active!.type;
    const after = hardDrop(state, seededRng(6));
    expect(after.score).toBeGreaterThan(0);
    expect(after.active).not.toBeNull();
    // 새 블록이 스폰됨 (큐가 소비됨)
    expect(after.active!.type).not.toBe(undefined);
    expect(firstType).toBeDefined();
  });
});

describe("hold", () => {
  it("첫 홀드는 블록을 보관하고 새 블록을 가져온다", () => {
    const state = startGame(seededRng(7));
    const held = holdPiece(state, seededRng(7));
    expect(held.hold).toBe(state.active!.type);
    expect(held.holdUsed).toBe(true);
  });

  it("같은 블록에서 홀드를 두 번 쓸 수 없다", () => {
    const state = startGame(seededRng(8));
    const once = holdPiece(state, seededRng(8));
    const twice = holdPiece(once, seededRng(8));
    expect(twice).toBe(once); // 변화 없음
  });

  it("빈 홀드에서 새 블록이 스폰 자리와 겹치면 게임오버로 처리한다", () => {
    const board: Board = createEmptyBoard();
    // 스폰 영역(최상단 두 행)을 가득 채워, 어떤 블록이 스폰돼도 충돌하게 만든다
    for (let x = 0; x < BOARD_WIDTH; x++) {
      board[0][x] = "I" as PieceType;
      board[1][x] = "I" as PieceType;
    }
    const state = {
      ...createInitialState(seededRng(9)),
      board,
      active: { type: "T", rotation: 0, x: 3, y: 0 } as ActivePiece,
      hold: null,
      holdUsed: false,
      phase: "playing" as const,
    };
    const held = holdPiece(state, seededRng(9));
    expect(held.phase).toBe("gameover");
    expect(held.active).toBeNull();
    expect(held.hold).toBe("T"); // 보관은 반영됨
  });
});

describe("items", () => {
  it("게이지는 지운 라인만큼 충전되고, 가득 차면 아이템을 획득한다", () => {
    // 한 번에 ITEM_GAUGE_MAX 를 채우면 아이템 1개 획득 + 게이지 0
    const r1 = chargeItemGauge(0, [], ITEM_GAUGE_MAX, seededRng(1));
    expect(r1.items).toHaveLength(1);
    expect(r1.gauge).toBe(0);

    // 임계 미만이면 아이템 없이 게이지만 증가
    const r2 = chargeItemGauge(0, [], 2, seededRng(1));
    expect(r2.items).toHaveLength(0);
    expect(r2.gauge).toBe(2);
  });

  it("보유 상한을 넘으면 더 획득하지 않는다", () => {
    const full: ItemType[] = Array.from({ length: ITEM_MAX_HELD }, () => "bomb");
    const r = chargeItemGauge(0, full, ITEM_GAUGE_MAX * 5, seededRng(1));
    expect(r.items).toHaveLength(ITEM_MAX_HELD);
    expect(r.gauge).toBeLessThanOrEqual(ITEM_GAUGE_MAX);
  });

  it("폭탄은 바닥 2줄을 제거하고 높이를 유지한다", () => {
    const board = createEmptyBoard();
    const bottom = TOTAL_HEIGHT - 1;
    for (let x = 0; x < BOARD_WIDTH; x++) {
      board[bottom][x] = "I" as PieceType;
      board[bottom - 1][x] = "O" as PieceType;
      board[bottom - 2][x] = "T" as PieceType;
    }
    const after = applyBomb(board);
    expect(after).toHaveLength(TOTAL_HEIGHT);
    // 아래 2줄(I, O)은 사라지고, T 줄이 맨 아래로 내려온다
    expect(after[bottom].every((c) => c === "T")).toBe(true);
    expect(after[bottom - 1].every((c) => c === 0)).toBe(true);
  });

  it("라인 소거는 가장 많이 채워진 줄을 제거한다", () => {
    const board = createEmptyBoard();
    const bottom = TOTAL_HEIGHT - 1;
    // bottom: 10칸 중 9칸, bottom-1: 10칸 전부 → 가장 찬 줄은 bottom-1
    for (let x = 0; x < BOARD_WIDTH; x++) board[bottom - 1][x] = "I" as PieceType;
    for (let x = 0; x < BOARD_WIDTH - 1; x++) board[bottom][x] = "O" as PieceType;
    const after = applyClearLine(board);
    expect(after).toHaveLength(TOTAL_HEIGHT);
    // 가득 찼던 줄(I)이 사라졌으므로 보드에 I 가 없어야 한다
    expect(after.some((row) => row.some((c) => c === "I"))).toBe(false);
  });

  it("consumeItem 은 지정한 슬롯의 아이템만 소비한다", () => {
    const base = createInitialState(seededRng(2));
    const state = { ...base, phase: "playing" as const, items: ["bomb"] as ItemType[] };
    const used = consumeItem(state, 0);
    expect(used.items).toHaveLength(0);
    // 빈 슬롯을 지정하면 변화 없음
    const noop = consumeItem(used, 0);
    expect(noop).toBe(used);
  });

  it("같은 종류가 여러 칸에 있어도 선택한 슬롯을 소비한다", () => {
    const base = createInitialState(seededRng(2));
    // [bomb, clearLine, bomb] 에서 슬롯 2(세 번째)를 사용 → [bomb, clearLine] 가 남아야 한다
    const state = {
      ...base,
      phase: "playing" as const,
      items: ["bomb", "clearLine", "bomb"] as ItemType[],
    };
    const used = consumeItem(state, 2);
    expect(used.items).toEqual(["bomb", "clearLine"]);
  });

  it("아이템으로 줄이 붕괴해도 활성 블록이 충돌하지 않는 위치로 이동한다", () => {
    const base = createInitialState(seededRng(3));
    const board = createEmptyBoard();
    const bottom = TOTAL_HEIGHT - 1;
    // 바닥 근처를 채워, 폭탄으로 줄이 아래로 밀려 내려오게 한다
    for (let x = 0; x < BOARD_WIDTH; x++) {
      board[bottom][x] = "I" as PieceType;
      board[bottom - 1][x] = "O" as PieceType;
    }
    // 활성 블록을 쌓인 블록 바로 위(붕괴 후 셀이 올라올 자리)에 둔다
    const active: ActivePiece = { type: "O", rotation: 0, x: 3, y: bottom - 3 };
    const state = {
      ...base,
      board,
      active,
      phase: "playing" as const,
      items: ["bomb"] as ItemType[],
    };
    const used = consumeItem(state, 0);
    // 적용 후 활성 블록은 보드와 충돌하지 않아야 한다
    expect(used.active).not.toBeNull();
    expect(collides(used.board, used.active!)).toBe(false);
  });

  it("붕괴 후 블록이 보드에 완전히 재진입할 수 없으면 top-out 처리한다", () => {
    const base = createInitialState(seededRng(4));
    const board = createEmptyBoard();
    // 세로 I(4칸)를 보드 바닥에 두고, 그 위 열(col3)을 가득 채운다.
    const holeX = 3; // 세로 I 셀 열 = x+2
    const active: ActivePiece = { type: "I", rotation: 1, x: 1, y: TOTAL_HEIGHT - 4 };
    for (let y = 0; y < TOTAL_HEIGHT; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        // col3 의 바닥 4칸(블록 자리)만 비워 두고 나머지는 모두 채운다
        const isPieceCol = x === holeX;
        const isPieceRow = y >= TOTAL_HEIGHT - 4;
        board[y][x] = isPieceCol && isPieceRow ? (0 as Cell) : ("I" as PieceType);
      }
    }
    // 시작 상태는 유효(블록 열의 바닥 4칸이 비어 있음)
    expect(collides(board, active)).toBe(false);
    const state = {
      ...base,
      board,
      active,
      phase: "playing" as const,
      items: ["bomb"] as ItemType[],
    };
    // 폭탄으로 바닥 2줄을 지우면 꼭대기 2줄만 비므로 4칸짜리 세로 I 는 재진입 불가 → top-out
    const used = consumeItem(state, 0);
    expect(used.phase).toBe("gameover");
    expect(used.active).toBeNull();
    expect(used.items).toHaveLength(0); // 아이템은 소비됨
  });
});
