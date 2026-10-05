"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { gravityIntervalMs, SLOW_FACTOR } from "@/lib/tetris/constants";
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
  consumeItem,
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
  /** 보유한 아이템을 사용 (슬롯 순서대로 1/2번) */
  activateItem: (slot: number) => void;
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
    // 숨겨진 탭에서 rAF 가 멈춰 있다가 돌아오면 delta 가 수 분이 될 수 있다.
    // 그 전체를 중력/경과시간에 더하면 블록이 한 번에 쏟아져 즉시 게임오버가 되고
    // 숨은 시간이 플레이 시간으로 잡히므로, 프레임 간격에 상한을 둔다.
    const MAX_FRAME_DELTA = 100;

    const loop = (timestamp: number) => {
      const prev = lastFrameRef.current;
      lastFrameRef.current = timestamp;
      const current = stateRef.current;

      if (prev !== null && current.phase === "playing") {
        const delta = Math.min(timestamp - prev, MAX_FRAME_DELTA);
        gravityAccRef.current += delta;

        // 경과 시간 누적 + 슬로우 아이템 잔여 시간 감소(상한 적용된 delta 사용)
        let working = {
          ...current,
          elapsedMs: current.elapsedMs + delta,
          slowMsRemaining: Math.max(0, current.slowMsRemaining - delta),
        };

        // 슬로우가 활성화된 동안에는 낙하 간격을 늘려 느리게 한다
        const baseInterval = gravityIntervalMs(working.level);
        const interval =
          working.slowMsRemaining > 0
            ? Math.round(baseInterval * SLOW_FACTOR)
            : baseInterval;
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

    // 탭이 숨겨지면 다음 프레임 기준시각을 리셋해, 복귀 시 거대한 delta 가 생기지 않도록 한다.
    const resetFrameClock = () => {
      lastFrameRef.current = null;
      gravityAccRef.current = 0;
    };
    const onVisibility = () => {
      if (document.hidden) resetFrameClock();
    };
    window.addEventListener("blur", resetFrameClock);
    document.addEventListener("visibilitychange", onVisibility);

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      lastFrameRef.current = null;
      window.removeEventListener("blur", resetFrameClock);
      document.removeEventListener("visibilitychange", onVisibility);
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

  const activateItem = useCallback(
    (slot: number) => {
      update(consumeItem(stateRef.current, slot));
    },
    [update],
  );

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

    // 탭 전환·포커스 상실 시 keyup 이 전달되지 않아 타이머가 남을 수 있으므로 모두 정리
    const stopAllRepeat = () => {
      for (const key of Array.from(held)) {
        stopRepeat(key);
      }
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
        case "1":
          e.preventDefault();
          if (!e.repeat) activateItem(0);
          break;
        case "2":
          e.preventDefault();
          if (!e.repeat) activateItem(1);
          break;
        case "3":
          e.preventDefault();
          if (!e.repeat) activateItem(2);
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

    const onVisibilityChange = () => {
      if (document.hidden) stopAllRepeat();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", stopAllRepeat);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", stopAllRepeat);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      Object.values(delayTimers).forEach(clearTimeout);
      Object.values(repeatTimers).forEach(clearInterval);
    };
  }, [
    moveLeft,
    moveRight,
    softDropStep,
    rotateCW,
    rotateCCW,
    hardDropNow,
    hold,
    pause,
    activateItem,
  ]);

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
    activateItem,
  };
}
