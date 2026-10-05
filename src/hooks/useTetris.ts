"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { gravityIntervalMs } from "@/lib/tetris/constants";
import {
  createInitialState,
  hardDrop,
  holdPiece,
  softDrop,
  startGame,
  tick,
  togglePause,
  tryMove,
  tryRotate,
} from "@/lib/tetris/engine";
import type { GameState } from "@/lib/tetris/types";

export interface TetrisStats {
  score: number;
  lines: number;
  level: number;
  durationMs: number;
}

interface UseTetrisOptions {
  onGameOver?: (stats: TetrisStats) => void;
}

export interface UseTetrisResult {
  state: GameState;
  start: () => void;
  moveLeft: () => void;
  moveRight: () => void;
  rotateCW: () => void;
  rotateCCW: () => void;
  softDropStep: () => void;
  hardDropNow: () => void;
  hold: () => void;
  pause: () => void;
}

/** 자동 반복(DAS) 간격 */
const MOVE_REPEAT_MS = 60;
const MOVE_DELAY_MS = 160;

export function useTetris(options: UseTetrisOptions = {}): UseTetrisResult {
  const [state, setState] = useState<GameState>(() => createInitialState());
  const stateRef = useRef(state);
  stateRef.current = state;

  const onGameOverRef = useRef(options.onGameOver);
  onGameOverRef.current = options.onGameOver;

  // 중력 누적 타이머
  const gravityAccRef = useRef(0);
  const lastFrameRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const gameOverFiredRef = useRef(false);

  const update = useCallback((next: GameState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  // 게임오버 콜백은 phase 변화를 감지해 한 번만 호출
  useEffect(() => {
    if (state.phase === "gameover" && !gameOverFiredRef.current) {
      gameOverFiredRef.current = true;
      onGameOverRef.current?.({
        score: state.score,
        lines: state.lines,
        level: state.level,
        durationMs: Math.round(state.elapsedMs),
      });
    }
    if (state.phase === "playing") {
      gameOverFiredRef.current = false;
    }
  }, [state.phase, state.score, state.lines, state.level, state.elapsedMs]);

  // 메인 루프 (requestAnimationFrame 기반 — PRD 비기능 요구사항)
  useEffect(() => {
    const loop = (timestamp: number) => {
      const prev = lastFrameRef.current;
      lastFrameRef.current = timestamp;
      const current = stateRef.current;

      if (prev !== null && current.phase === "playing") {
        const delta = timestamp - prev;
        gravityAccRef.current += delta;

        // 경과 시간 누적
        let working = { ...current, elapsedMs: current.elapsedMs + delta };

        const interval = gravityIntervalMs(working.level);
        while (gravityAccRef.current >= interval) {
          gravityAccRef.current -= interval;
          working = tick(working);
          if (working.phase !== "playing") break;
        }
        update(working);
      } else {
        // 일시정지/대기 중에는 중력 누적을 초기화
        gravityAccRef.current = 0;
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      lastFrameRef.current = null;
    };
  }, [update]);

  const start = useCallback(() => {
    gravityAccRef.current = 0;
    lastFrameRef.current = null;
    gameOverFiredRef.current = false;
    update(startGame());
  }, [update]);

  const moveLeft = useCallback(() => {
    update(tryMove(stateRef.current, -1, 0).state);
  }, [update]);

  const moveRight = useCallback(() => {
    update(tryMove(stateRef.current, 1, 0).state);
  }, [update]);

  const rotateCW = useCallback(() => {
    update(tryRotate(stateRef.current, 1).state);
  }, [update]);

  const rotateCCW = useCallback(() => {
    update(tryRotate(stateRef.current, -1).state);
  }, [update]);

  const softDropStep = useCallback(() => {
    update(softDrop(stateRef.current));
  }, [update]);

  const hardDropNow = useCallback(() => {
    update(hardDrop(stateRef.current));
  }, [update]);

  const hold = useCallback(() => {
    update(holdPiece(stateRef.current));
  }, [update]);

  const pause = useCallback(() => {
    update(togglePause(stateRef.current));
  }, [update]);

  // 키보드 조작 (PRD 조작표)
  useEffect(() => {
    const repeatTimers: Record<string, ReturnType<typeof setInterval>> = {};
    const delayTimers: Record<string, ReturnType<typeof setTimeout>> = {};
    const held = new Set<string>();

    const startRepeat = (key: string, action: () => void) => {
      if (held.has(key)) return;
      held.add(key);
      action();
      delayTimers[key] = setTimeout(() => {
        repeatTimers[key] = setInterval(action, MOVE_REPEAT_MS);
      }, MOVE_DELAY_MS);
    };

    const stopRepeat = (key: string) => {
      held.delete(key);
      if (delayTimers[key]) clearTimeout(delayTimers[key]);
      if (repeatTimers[key]) clearInterval(repeatTimers[key]);
      delete delayTimers[key];
      delete repeatTimers[key];
    };

    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          startRepeat("left", moveLeft);
          break;
        case "ArrowRight":
          e.preventDefault();
          startRepeat("right", moveRight);
          break;
        case "ArrowDown":
          e.preventDefault();
          startRepeat("down", softDropStep);
          break;
        case "ArrowUp":
        case "x":
        case "X":
          e.preventDefault();
          if (!e.repeat) rotateCW();
          break;
        case "z":
        case "Z":
          e.preventDefault();
          if (!e.repeat) rotateCCW();
          break;
        case " ":
          e.preventDefault();
          if (!e.repeat) hardDropNow();
          break;
        case "Shift":
        case "c":
        case "C":
          e.preventDefault();
          if (!e.repeat) hold();
          break;
        case "p":
        case "P":
        case "Escape":
          e.preventDefault();
          if (!e.repeat) pause();
          break;
        default:
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowLeft":
          stopRepeat("left");
          break;
        case "ArrowRight":
          stopRepeat("right");
          break;
        case "ArrowDown":
          stopRepeat("down");
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      Object.values(delayTimers).forEach(clearTimeout);
      Object.values(repeatTimers).forEach(clearInterval);
    };
  }, [moveLeft, moveRight, softDropStep, rotateCW, rotateCCW, hardDropNow, hold, pause]);

  return {
    state,
    start,
    moveLeft,
    moveRight,
    rotateCW,
    rotateCCW,
    softDropStep,
    hardDropNow,
    hold,
    pause,
  };
}
