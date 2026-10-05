import { describe, expect, it } from "vitest";
import {
  BOARD_WIDTH,
  LINES_PER_LEVEL,
  TOTAL_HEIGHT,
} from "./constants";
import {
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
} from "./engine";
import { createBag, refillQueue } from "./bag";
import { levelForLines, lineClearScore } from "./scoring";
import type { ActivePiece, Board, Cell, PieceType } from "./types";

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
});
