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
  setProfile: (profile: PlayerProfile) => void;
  /** 게임 진행 상태 보고 (전환 가능 여부 판단용) */
  setGameActive: (active: boolean) => void;
  /** 학생 전환: 프로필을 지우고 새 익명/로컬 UID 를 발급한다. */
  switchStudent: () => Promise<void>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [uid, setUid] = useState<string | null>(null);
  const [profile, setProfileState] = useState<PlayerProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  // 게임 진행 여부는 전환 시점에 최신값을 읽어야 하므로 ref 로 추적
  const gameActiveRef = useRef(false);
  const setGameActive = useCallback((active: boolean) => {
    gameActiveRef.current = active;
  }, []);

  useEffect(() => {
    let active = true;
    // 구버전(닉네임) 프로필 흔적만 있으면: 이전 사용자 UID 를 분리하고 흔적을 정리한 뒤 새로 시작
    const legacy = hasLegacyProfile();
    if (legacy) {
      clearProfile();
      setProfileState(null);
    } else {
      setProfileState(loadProfile());
    }

    const init = async () => {
      if (legacy) {
        // 이전(닉네임) 사용자의 익명 UID 로 새 학생 기록이 병합되지 않도록 UID 를 교체
        await signOutAnonymous().catch(() => {});
        rotateLocalUid();
      }
      const resolvedUid = await ensureAnonymousUid();
      if (!active) return;
      // 실제 uid 면, 아직 전송되지 않은 대기 기록의 uid 를 먼저 로컬에서 재바인딩한다.
      if (!resolvedUid.startsWith("local-")) {
        localRebindPending(resolvedUid);
      }
      setUid(resolvedUid);
      // 재바인딩 후 서버로 재전송 시도(완료를 기다리지 않음 — 읽기는 이미 일관됨)
      void flushPending(resolvedUid);
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
    // 0) 게임이 진행(또는 일시정지) 중이면 전환을 막는다. 전환을 inactive 상태에서만 시작하고
    //    전환 중에는 새 게임 시작도 막으므로(isSwitching), 전환 구간에 게임오버·새 저장이 생기지 않는다.
    if (gameActiveRef.current) {
      throw new Error(SWITCH_ERR_GAME_ACTIVE);
    }
    // 1) 진행 중인 저장이 있으면 전환을 막는다(저장 완료 후 재시도 유도).
    if (hasInFlightSaves()) {
      throw new Error(SWITCH_ERR_SAVING);
    }
    setIsSwitching(true);
    try {
      // 2) 이전 학생의 대기 기록을 "아직 그 학생으로 인증된 상태에서" 먼저 전송한다.
      if (uid) {
        try {
          await flushPending(uid);
        } catch {
          /* 네트워크 등 전송 실패 — 아래 잔존 검사에서 전환을 중단시킨다 */
        }
      }
      // 3) 아직 전송되지 못한 대기 기록이 남아 있으면 전환을 중단한다(영구 유실·섞임 방지).
      if (hasPendingRecords()) {
        throw new Error(SWITCH_ERR_PENDING);
      }
      // 4) 익명 로그아웃 — 실패하면 전환을 중단한다(throw 시 프로필/UID 유지).
      await signOutAnonymous();
      // 5) 프로필 제거 + 로컬 UID 교체 + 새 UID 발급 → 다음 학생이 깨끗한 신원으로 시작
      clearProfile();
      rotateLocalUid();
      const freshUid = await ensureAnonymousUid();
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
      setProfile,
      setGameActive,
      switchStudent,
    }),
    [uid, profile, authReady, isSwitching, setProfile, setGameActive, switchStudent],
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
