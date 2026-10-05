"use client";

import { GamePanel } from "@/components/GamePanel";
import { StartForm } from "@/components/StartForm";
import { usePlayer } from "@/components/PlayerProvider";

export default function HomePage() {
  const { profile, authReady, migrationBlocked } = usePlayer();

  if (!authReady) {
    return (
      <div className="centered-state">
        <p>불러오는 중…</p>
      </div>
    );
  }

  // 구버전 사용자의 기록 정리가 끝나지 않으면, 이전 사용자와 섞이지 않도록 입력을 막는다.
  if (migrationBlocked) {
    return (
      <div className="centered-state">
        <div className="nickname-card">
          <h1>잠시만요</h1>
          <p className="lead">
            이 기기에 이전 사용자의 기록이 아직 정리되지 않았어요. 네트워크 연결을 확인한 뒤
            페이지를 새로고침해 주세요.
          </p>
          <button
            type="button"
            className="primary-btn full"
            onClick={() => window.location.reload()}
          >
            새로고침
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="centered-state">
        <StartForm />
      </div>
    );
  }

  return <GamePanel />;
}
