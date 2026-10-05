"use client";

import { PIECE_COLORS, PIECE_SHAPES } from "@/lib/tetris/constants";
import type { PieceType } from "@/lib/tetris/types";

interface PiecePreviewProps {
  piece: PieceType | null;
  dimmed?: boolean;
}

/** Next/Hold 용 4x4 미니 블록 미리보기 */
export function PiecePreview({ piece, dimmed = false }: PiecePreviewProps) {
  const cells = new Set<string>();
  if (piece) {
    for (const [dx, dy] of PIECE_SHAPES[piece][0]) {
      cells.add(`${dx},${dy}`);
    }
  }

  return (
    <div className={`preview-grid${dimmed ? " dimmed" : ""}`} aria-hidden={!piece}>
      {Array.from({ length: 4 }).map((_, y) =>
        Array.from({ length: 4 }).map((__, x) => {
          const filled = cells.has(`${x},${y}`);
          return (
            <div
              key={`${x}-${y}`}
              className={`preview-cell${filled ? " filled" : ""}`}
              style={
                filled && piece
                  ? { backgroundColor: PIECE_COLORS[piece], borderColor: PIECE_COLORS[piece] }
                  : undefined
              }
            />
          );
        }),
      )}
    </div>
  );
}
