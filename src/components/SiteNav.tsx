"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  SWITCH_ERR_GAME_ACTIVE,
  SWITCH_ERR_PENDING,
  SWITCH_ERR_SAVING,
  usePlayer,
} from "./PlayerProvider";

const LINKS = [
  { href: "/", label: "게임" },
  { href: "/dashboard", label: "내 기록" },
  { href: "/leaderboard", label: "리더보드" },
  { href: "/teacher", label: "교사용" },
];

export function SiteNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, switchStudent } = usePlayer();
  const [switching, setSwitching] = useState(false);

  const handleSwitch = async () => {
    if (switching) return;
    const ok = window.confirm(
      "학생을 전환할까요? 다른 학생이 이어서 플레이할 수 있도록 로그인 정보를 지웁니다.",
    );
    if (!ok) return;
    setSwitching(true);
    try {
      await switchStudent();
      router.push("/");
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      const message =
        code === SWITCH_ERR_GAME_ACTIVE
          ? "게임이 진행 중이에요. 게임을 끝낸 뒤 학생 전환을 해주세요."
          : code === SWITCH_ERR_SAVING
            ? "기록을 저장하는 중이에요. 저장이 끝난 뒤 다시 시도해 주세요."
            : code === SWITCH_ERR_PENDING
              ? "아직 서버에 전송되지 않은 기록이 있어요. 네트워크 연결을 확인한 뒤 다시 시도해 주세요."
              : "학생 전환에 실패했어요(네트워크 문제일 수 있음). 잠시 후 다시 시도해 주세요.";
      window.alert(message);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <nav className="site-nav" aria-label="주 메뉴">
      <Link href="/" className="brand">
        🎮 테트리스 교실
      </Link>
      <ul>
        {LINKS.map((link) => {
          const active =
            link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className={active ? "active" : undefined}
                aria-current={active ? "page" : undefined}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
        {profile && (
          <li>
            <button
              type="button"
              className="nav-switch"
              onClick={handleSwitch}
              disabled={switching}
              title={`${profile.name} 님 — 학생 전환`}
            >
              {switching ? "전환 중…" : "학생 전환"}
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
}
