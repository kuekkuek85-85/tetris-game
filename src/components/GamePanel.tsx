"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Board } from "./Board";
import { PiecePreview } from "./PiecePreview";
import { TouchControls } from "./TouchControls";
import { usePlayer } from "./PlayerProvider";
import { useTetris, type TetrisStats } from "@/hooks/useTetris";
import { NEXT_COUNT } from "@/lib/tetris/constants";
import { saveGame, type SaveResult } from "@/lib/records";
import { formatDuration, formatNumber } from "@/lib/format";

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "done"; result: SaveResult };

export function GamePanel() {
  const { uid, profile, firebaseEnabled } = usePlayer();
  const [lastStats, setLastStats] = useState<TetrisStats | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });

  const handleGameOver = useCallback(
    (stats: TetrisStats) => {
      setLastStats(stats);
      if (!uid || !profile) {
        setSaveState({ status: "done", result: { ok: false, fallback: true } });
        return;
      }
      setSaveState({ status: "saving" });
      saveGame({
        uid,
        nickname: profile.nickname,
        classId: profile.classId,
        studentNo: profile.studentNo,
        score: stats.score,
        lines: stats.lines,
        level: stats.level,
        durationMs: stats.durationMs,
      })
        .then((result) => setSaveState({ status: "done", result }))
        .catch((err) =>
          setSaveState({
            status: "done",
            result: { ok: false, fallback: true, error: String(err) },
          }),
        );
    },
    [uid, profile],
  );

  const {
    state,
    start,
    moveLeft,
    moveRight,
    rotateCW,
    softDropStep,
    hardDropNow,
    hold,
    pause,
  } = useTetris({ onGameOver: handleGameOver });

  const handleStart = useCallback(() => {
    setLastStats(null);
    setSaveState({ status: "idle" });
    start();
  }, [start]);

  // 스와이프 제스처 (터치)
  const boardWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = boardWrapRef.current;
    if (!el) return;
    let startX = 0;
    let startY = 0;
    let startT = 0;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      startX = t.clientX;
      startY = t.clientY;
      startT = Date.now();
    };
    const onTouchEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const dt = Date.now() - startT;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (absX < 24 && absY < 24 && dt < 250) {
        rotateCW(); // 탭 = 회전
        return;
      }
      if (absX > absY) {
        if (dx > 0) moveRight();
        else moveLeft();
      } else {
        if (dy > 0) {
          // 빠른 아래 플릭 = 하드 드롭, 느린 스와이프 = 소프트 드롭
          if (dt < 200 && absY > 80) hardDropNow();
          else softDropStep();
        }
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [moveLeft, moveRight, rotateCW, softDropStep, hardDropNow]);

  const nextPieces = state.queue.slice(0, NEXT_COUNT);

  return (
    <div className="game-panel">
      <div className="game-main">
        <aside className="side-col left">
          <section className="panel-box">
            <h2 className="panel-title">홀드</h2>
            <PiecePreview piece={state.hold} dimmed={state.holdUsed} />
          </section>
          <section className="panel-box stats">
            <dl>
              <div>
                <dt>점수</dt>
                <dd>{formatNumber(state.score)}</dd>
              </div>
              <div>
                <dt>라인</dt>
                <dd>{state.lines}</dd>
              </div>
              <div>
                <dt>레벨</dt>
                <dd>{state.level}</dd>
              </div>
              <div>
                <dt>시간</dt>
                <dd>{formatDuration(state.elapsedMs)}</dd>
              </div>
            </dl>
          </section>
        </aside>

        <div className="board-wrap" ref={boardWrapRef}>
          <Board state={state} />

          {state.phase === "ready" && (
            <Overlay>
              <h2>테트리스</h2>
              <p className="overlay-sub">
                {profile ? `${profile.nickname} 님, 준비되었나요?` : "준비되었나요?"}
              </p>
              <button type="button" className="primary-btn" onClick={handleStart}>
                시작하기
              </button>
              <KeyGuide />
            </Overlay>
          )}

          {state.phase === "paused" && (
            <Overlay>
              <h2>일시정지</h2>
              <button type="button" className="primary-btn" onClick={pause}>
                계속하기
              </button>
            </Overlay>
          )}

          {state.phase === "gameover" && lastStats && (
            <Overlay>
              <h2>게임 오버</h2>
              <ul className="result-list">
                <li>
                  <span>최종 점수</span>
                  <strong>{formatNumber(lastStats.score)}</strong>
                </li>
                <li>
                  <span>삭제 라인</span>
                  <strong>{lastStats.lines}</strong>
                </li>
                <li>
                  <span>도달 레벨</span>
                  <strong>{lastStats.level}</strong>
                </li>
                <li>
                  <span>플레이 시간</span>
                  <strong>{formatDuration(lastStats.durationMs)}</strong>
                </li>
              </ul>
              <SaveStatus saveState={saveState} firebaseEnabled={firebaseEnabled} />
              <div className="overlay-actions">
                <button type="button" className="primary-btn" onClick={handleStart}>
                  다시하기
                </button>
                <Link className="secondary-btn" href="/leaderboard">
                  리더보드
                </Link>
                <Link className="secondary-btn" href="/dashboard">
                  내 기록
                </Link>
              </div>
            </Overlay>
          )}
        </div>

        <aside className="side-col right">
          <section className="panel-box">
            <h2 className="panel-title">다음</h2>
            <div className="next-list">
              {nextPieces.map((p, i) => (
                <PiecePreview key={`${p}-${i}`} piece={p} />
              ))}
            </div>
          </section>
        </aside>
      </div>

      <TouchControls
        onLeft={moveLeft}
        onRight={moveRight}
        onRotate={rotateCW}
        onSoftDrop={softDropStep}
        onHardDrop={hardDropNow}
        onHold={hold}
        onPause={pause}
      />
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="board-overlay" role="dialog" aria-modal="true">
      <div className="overlay-card">{children}</div>
    </div>
  );
}

function SaveStatus({
  saveState,
  firebaseEnabled,
}: {
  saveState: SaveState;
  firebaseEnabled: boolean;
}) {
  if (saveState.status === "saving") {
    return <p className="save-status">기록 저장 중…</p>;
  }
  if (saveState.status === "done") {
    if (!saveState.result.ok) {
      return <p className="save-status warn">닉네임이 없어 기록을 저장하지 못했어요.</p>;
    }
    if (saveState.result.fallback) {
      return (
        <p className="save-status warn">
          {firebaseFallbackMessage(firebaseEnabled)}
        </p>
      );
    }
    return <p className="save-status ok">기록이 저장되었어요!</p>;
  }
  return null;
}

function firebaseFallbackMessage(firebaseEnabled: boolean): string {
  return firebaseEnabled
    ? "서버 저장에 실패해 이 기기에 임시 저장했어요."
    : "이 기기에 기록을 저장했어요. (서버 미연결)";
}

function KeyGuide() {
  return (
    <ul className="key-guide">
      <li>← → 이동 · ↑ 회전</li>
      <li>↓ 소프트드롭 · Space 하드드롭</li>
      <li>Shift/C 홀드 · P/Esc 일시정지</li>
    </ul>
  );
}
