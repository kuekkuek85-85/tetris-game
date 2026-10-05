"use client";

interface TouchControlsProps {
  onLeft: () => void;
  onRight: () => void;
  onRotate: () => void;
  onSoftDrop: () => void;
  onHardDrop: () => void;
  onHold: () => void;
  onPause: () => void;
}

/** 모바일·태블릿용 터치 조작 버튼 (마우스 없이 완전 조작) */
export function TouchControls({
  onLeft,
  onRight,
  onRotate,
  onSoftDrop,
  onHardDrop,
  onHold,
  onPause,
}: TouchControlsProps) {
  return (
    <div className="touch-controls" aria-label="터치 조작">
      <div className="touch-row">
        <button type="button" className="touch-btn" onClick={onHold} aria-label="홀드">
          홀드
        </button>
        <button type="button" className="touch-btn" onClick={onPause} aria-label="일시정지">
          일시정지
        </button>
      </div>
      <div className="touch-row">
        <button type="button" className="touch-btn big" onClick={onLeft} aria-label="왼쪽 이동">
          ◀
        </button>
        <button type="button" className="touch-btn big" onClick={onRotate} aria-label="회전">
          ⟳
        </button>
        <button type="button" className="touch-btn big" onClick={onRight} aria-label="오른쪽 이동">
          ▶
        </button>
      </div>
      <div className="touch-row">
        <button type="button" className="touch-btn big" onClick={onSoftDrop} aria-label="소프트 드롭">
          ▼
        </button>
        <button type="button" className="touch-btn big accent" onClick={onHardDrop} aria-label="하드 드롭">
          ⤓
        </button>
      </div>
    </div>
  );
}
