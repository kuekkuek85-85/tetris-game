"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ensureAnonymousUid, signOutAnonymous } from "@/lib/firebase/auth";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { flushPending, hasInFlightSaves, hasPendingRecords } from "@/lib/records";
import { localRebindPending } from "@/lib/records/localStore";
import {
  clearProfile,
  hasLegacyProfile,
  loadProfile,
  rotateLocalUid,
  saveProfile as persistProfile,
  type PlayerProfile,
} from "@/lib/identity";

/** 전환 실패 사유 — 아직 전송되지 못한 대기 기록이 남아 있음 */
export const SWITCH_ERR_PENDING = "PENDING_NOT_EMPTY";
/** 전환 실패 사유 — 아직 진행 중인 저장이 있음 */
export const SWITCH_ERR_SAVING = "SAVE_IN_FLIGHT";
/** 전환 실패 사유 — 게임이 진행(또는 일시정지) 중 */
export const SWITCH_ERR_GAME_ACTIVE = "GAME_ACTIVE";

interface PlayerContextValue {
  uid: string | null;
  profile: PlayerProfile | null;
  authReady: boolean;
  firebaseEnabled: boolean;
  /** 학생 전환이 진행 중인지 (전환 중엔 새 게임 시작을 막는다) */
  isSwitching: boolean;
  /** 구버전 프로필 정리(이전 사용자 분리)가 실패해 입력이 막힌 상태 */
  migrationBlocked: boolean;
  setProfile: (profile: PlayerProfile) => void;
  /** 게임 진행 상태 보고 (전환 가능 여부 판단용) */
  setGameActive: (active: boolean) => void;
  /** 학생 전환: 프로필을 지우고 새 익명/로컬 UID 를 발급한다. */
  switchStudent: () => Promise<void>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

/**
 * 이전 사용자(prevUid)를 안전하게 정리하고 새 익명/로컬 UID 로 교체한다.
 * 학생 전환과 구버전(닉네임) 프로필 마이그레이션이 공유한다.
 * - 이전 사용자의 대기 기록을 "아직 그 사용자로 인증된 상태에서" 먼저 전송한다.
 * - 전송 못한 기록이 남으면 SWITCH_ERR_PENDING 으로 중단(이전 UID 유실/다음 학생 흡수 방지).
 * - signOut 실패 시 예외를 전파(이전 UID 가 남은 채 새 신원을 받지 않도록).
 * - clearProfile 은 signOut 성공 "후"에만 호출하므로, 중단 시 마커가 보존되어 재시도 가능.
 */
async function rotateToNewIdentity(prevUid: string | null): Promise<string> {
  // flushPending 내부에서 local-* 대기 기록은 prevUid 로 재바인딩되어 전송된다.
  try {
    await flushPending(prevUid ?? undefined);
  } catch {
    /* 네트워크 등 전송 실패 — 아래 잔존 검사에서 중단 */
  }
  if (hasPendingRecords()) {
    throw new Error(SWITCH_ERR_PENDING);
  }
  await signOutAnonymous(); // 실패 시 throw → 호출부가 중단 처리
  clearProfile();
  rotateLocalUid();
  return ensureAnonymousUid();
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [uid, setUid] = useState<string | null>(null);
  const [profile, setProfileState] = useState<PlayerProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [migrationBlocked, setMigrationBlocked] = useState(false);

  // 게임 진행 여부는 전환 시점에 최신값을 읽어야 하므로 ref 로 추적
  const gameActiveRef = useRef(false);
  const setGameActive = useCallback((active: boolean) => {
    gameActiveRef.current = active;
  }, []);

  useEffect(() => {
    let active = true;
    const legacy = hasLegacyProfile();
    setProfileState(legacy ? null : loadProfile());

    const init = async () => {
      // 현재(레거시이면 이전 사용자의) UID 를 확보한다.
      const currentUid = await ensureAnonymousUid();
      if (!active) return;

      if (legacy) {
        // 구버전(닉네임) 사용자 → 안전하게 정리 후 UID 교체. 실패 시 마커 보존 + 입력 차단.
        try {
          const freshUid = await rotateToNewIdentity(currentUid);
          if (!active) return;
          setUid(freshUid);
        } catch {
          if (!active) return;
          setMigrationBlocked(true);
          setUid(currentUid);
        }
        return;
      }

      // 일반 경로: 실제 uid 면 local-* 대기 기록을 즉시 재바인딩 후 재전송 시도
      if (!currentUid.startsWith("local-")) {
        localRebindPending(currentUid);
      }
      setUid(currentUid);
      void flushPending(currentUid);
    };

    init().finally(() => {
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
    // 0) 게임이 진행(또는 일시정지) 중이면 전환을 막는다. 전환은 inactive 상태에서만 시작하고
    //    전환 중에는 새 게임 시작도 막으므로(isSwitching), 전환 구간에 게임오버·새 저장이 없다.
    if (gameActiveRef.current) {
      throw new Error(SWITCH_ERR_GAME_ACTIVE);
    }
    // 1) 진행 중인 저장이 있으면 전환을 막는다(저장 완료 후 재시도 유도).
    if (hasInFlightSaves()) {
      throw new Error(SWITCH_ERR_SAVING);
    }
    setIsSwitching(true);
    try {
      const freshUid = await rotateToNewIdentity(uid);
      setProfileState(null);
      setUid(freshUid);
    } finally {
      setIsSwitching(false);
    }
  }, [uid]);

  const value = useMemo<PlayerContextValue>(
    () => ({
      uid,
      profile,
      authReady,
      firebaseEnabled: isFirebaseConfigured(),
      isSwitching,
      migrationBlocked,
      setProfile,
      setGameActive,
      switchStudent,
    }),
    [
      uid,
      profile,
      authReady,
      isSwitching,
      migrationBlocked,
      setProfile,
      setGameActive,
      switchStudent,
    ],
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
