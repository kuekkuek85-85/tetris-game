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
import {
  beginStudentSwitch,
  endStudentSwitch,
  flushPending,
  hasInFlightSaves,
  hasPendingRecords,
} from "@/lib/records";
import { localRebindPending } from "@/lib/records/localStore";

/** 전환 실패 사유 — 아직 전송되지 못한 대기 기록이 남아 있음 */
export const SWITCH_ERR_PENDING = "PENDING_NOT_EMPTY";
/** 전환 실패 사유 — 아직 진행 중인 저장이 있음 */
export const SWITCH_ERR_SAVING = "SAVE_IN_FLIGHT";
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
    // 0) 진행 중인 저장이 있으면 전환을 막는다(저장 완료 후 재시도 유도).
    if (hasInFlightSaves()) {
      throw new Error(SWITCH_ERR_SAVING);
    }
    // 전환 "전 구간" 동안 새 저장을 차단한다. 이후 게임오버가 발생해도 saveGame 이 거부되어
    // 이전 UID 로 복구 불가한 기록이 남지 않는다. (point-in-time 검사만으로는 부족)
    beginStudentSwitch();
    try {
      // 1) 이전 학생의 대기 기록을 "아직 그 학생으로 인증된 상태에서" 먼저 전송한다.
      //    (전환 후에는 그 UID 로 다시 인증할 수 없어 전송·귀속이 영구 불가능)
      if (uid) {
        try {
          await flushPending(uid);
        } catch {
          /* 네트워크 등 전송 실패 — 아래 잔존 검사에서 전환을 중단시킨다 */
        }
      }
      // 2) 아직 전송되지 못한 대기 기록이 남아 있으면 전환을 중단한다.
      if (hasPendingRecords()) {
        throw new Error(SWITCH_ERR_PENDING);
      }
      // 3) 익명 로그아웃 — 실패하면 전환을 중단한다(throw 시 프로필/UID 유지).
      await signOutAnonymous();
      // 4) 프로필 제거 + 로컬 UID 교체 + 새 UID 발급 → 다음 학생이 깨끗한 신원으로 시작
      clearProfile();
      rotateLocalUid();
      const freshUid = await ensureAnonymousUid();
      setProfileState(null);
      setUid(freshUid);
    } finally {
      endStudentSwitch();
    }
  }, [uid]);

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
