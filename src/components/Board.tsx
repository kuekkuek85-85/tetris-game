"use client";

import { memo } from "react";
import { BOARD_WIDTH, PIECE_COLORS, SPAWN_BUFFER } from "@/lib/tetris/constants";
import { getGhostPiece, getPieceCells } from "@/lib/tetris/engine";
import type { Cell, GameState, PieceType } from "@/lib/tetris/types";

interface BoardProps {
  state: GameState;
}

type DisplayCell = { value: Cell; ghost: boolean };

/** 보드 + 활성 블록 + 고스트를 하나의 표시용 그리드로 합친다. */
function buildDisplayGrid(state: GameState): DisplayCell[][] {
  const grid: DisplayCell[][] = state.board.map((row) =>
    row.map((value) => ({ value, ghost: false })),
  );

  // 고스트(착지 예상 위치) 먼저 — 활성 블록에 덮일 수 있음
  const ghost = getGhostPiece(state);
  if (ghost && state.phase === "playing") {
    for (const [x, y] of getPieceCells(ghost)) {
      if (y >= 0 && y < grid.length && x >= 0 && x < BOARD_WIDTH) {
        if (grid[y][x].value === 0) {
          grid[y][x] = { value: ghost.type, ghost: true };
        }
      }
    }
  }

  // 활성 블록
  if (state.active) {
    for (const [x, y] of getPieceCells(state.active)) {
      if (y >= 0 && y < grid.length && x >= 0 && x < BOARD_WIDTH) {
        grid[y][x] = { value: state.active.type, ghost: false };
      }
    }
  }

  // 화면에 보이는 영역만 (상단 버퍼 제외)
  return grid.slice(SPAWN_BUFFER);
}

function BoardComponent({ state }: BoardProps) {
  const grid = buildDisplayGrid(state);

  return (
    <div
      className="board"
      role="grid"
      aria-label="테트리스 게임 보드"
      style={{ ["--cols" as string]: BOARD_WIDTH }}
    >
      {grid.map((row, y) => (
        <div className="board-row" role="row" key={y}>
          {row.map((cell, x) => {
            const filled = cell.value !== 0;
            const color = filled ? PIECE_COLORS[cell.value as PieceType] : undefined;
            return (
              <div
                key={x}
                role="gridcell"
                className={`cell${filled ? " filled" : ""}${cell.ghost ? " ghost" : ""}`}
                style={
                  filled
                    ? {
                        backgroundColor: cell.ghost ? "transparent" : color,
                        borderColor: color,
                      }
                    : undefined
                }
                data-piece={filled ? (cell.value as PieceType) : undefined}
              >
                {filled && !cell.ghost ? (
                  <span className="cell-glyph" aria-hidden>
                    {cell.value}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export const Board = memo(BoardComponent);
