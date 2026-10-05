"use client";

import { GamePanel } from "@/components/GamePanel";
import { StartForm } from "@/components/StartForm";
import { usePlayer } from "@/components/PlayerProvider";

export default function HomePage() {
  const { profile, authReady } = usePlayer();

  if (!authReady) {
    return (
      <div className="centered-state">
        <p>불러오는 중…</p>
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
