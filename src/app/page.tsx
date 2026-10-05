"use client";

import { GamePanel } from "@/components/GamePanel";
import { NicknameForm } from "@/components/NicknameForm";
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
        <NicknameForm />
      </div>
    );
  }

  return <GamePanel />;
}
