"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ensureAnonymousUid, signOutAnonymous } from "@/lib/firebase/auth";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { flushPending } from "@/lib/records";
import { localRebindPending } from "@/lib/records/localStore";
import {
  clearProfile,
  loadProfile,
  rotateLocalUid,
  saveProfile as persistProfile,
  type PlayerProfile,
} from "@/lib/identity";

interface PlayerContextValue {
  uid: string | null;
  profile: PlayerProfile | null;
  authReady: boolean;
  firebaseEnabled: boolean;
  setProfile: (profile: PlayerProfile) => void;
  /** 학생 전환: 프로필을 지우고 새 익명/로컬 UID 를 발급한다. */
  switchStudent: () => Promise<void>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [uid, setUid] = useState<string | null>(null);
  const [profile, setProfileState] = useState<PlayerProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let active = true;
    setProfileState(loadProfile());
    ensureAnonymousUid()
      .then((resolvedUid) => {
        if (!active) return;
        // 실제 uid 면, 아직 전송되지 않은 대기 기록의 uid 를 먼저 로컬에서 재바인딩한다.
        // (네트워크 flush 완료를 기다리지 않아도 읽기 병합이 새 uid 기준으로 즉시 일치)
        if (!resolvedUid.startsWith("local-")) {
          localRebindPending(resolvedUid);
        }
        setUid(resolvedUid);
        // 재바인딩 후 서버로 재전송 시도(완료를 기다리지 않음 — 읽기는 이미 일관됨)
        void flushPending(resolvedUid);
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const setProfile = useCallback((next: PlayerProfile) => {
    persistProfile(next);
    setProfileState(next);
  }, []);

  const switchStudent = useCallback(async () => {
    // 1) 프로필 제거 → 시작 화면(StartForm)으로 돌아간다
    clearProfile();
    setProfileState(null);
    setUid(null);
    // 2) 익명 로그아웃 + 로컬 UID 교체 → 다음 학생이 새 신원으로 시작
    await signOutAnonymous();
    rotateLocalUid();
    const freshUid = await ensureAnonymousUid();
    setUid(freshUid);
  }, []);

  const value = useMemo<PlayerContextValue>(
    () => ({
      uid,
      profile,
      authReady,
      firebaseEnabled: isFirebaseConfigured(),
      setProfile,
      switchStudent,
    }),
    [uid, profile, authReady, setProfile, switchStudent],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) {
    throw new Error("usePlayer must be used within a PlayerProvider");
  }
  return ctx;
}
