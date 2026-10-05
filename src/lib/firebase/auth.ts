// 익명 인증: Firebase 가 설정되어 있으면 Anonymous Auth, 아니면 로컬 UID.

import { onAuthStateChanged, signInAnonymously, signOut } from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "./config";
import { getOrCreateLocalUid } from "@/lib/identity";

/**
 * 익명 인증을 수행하고 uid 를 돌려준다.
 * Firebase 미설정/실패 시 로컬 UID 로 폴백.
 */
export async function ensureAnonymousUid(): Promise<string> {
  if (!isFirebaseConfigured()) {
    return getOrCreateLocalUid();
  }
  const auth = getFirebaseAuth();
  if (!auth) return getOrCreateLocalUid();

  try {
    if (auth.currentUser) return auth.currentUser.uid;
    const cred = await signInAnonymously(auth);
    return cred.user.uid;
  } catch {
    // 인증 실패(네트워크 차단 등) → 로컬 UID 폴백
    return getOrCreateLocalUid();
  }
}

/**
 * 익명 로그아웃. 다음 ensureAnonymousUid() 호출 시 새 익명 UID 가 발급된다.
 * (공용 브라우저에서 학생 전환 시 기록이 섞이지 않도록)
 *
 * 실패 시 예외를 던진다 — 로그아웃이 안 됐는데 전환을 진행하면 새 학생 기록이
 * 이전 학생 UID 로 저장되므로, 호출부가 전환을 중단할 수 있어야 한다.
 */
export async function signOutAnonymous(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const auth = getFirebaseAuth();
  if (!auth) return;
  await signOut(auth);
}

/** 인증 상태 변화 구독. Firebase 미설정 시 즉시 로컬 UID 로 콜백. */
export function subscribeUid(callback: (uid: string) => void): () => void {
  if (!isFirebaseConfigured()) {
    callback(getOrCreateLocalUid());
    return () => {};
  }
  const auth = getFirebaseAuth();
  if (!auth) {
    callback(getOrCreateLocalUid());
    return () => {};
  }
  return onAuthStateChanged(auth, (user) => {
    if (user) callback(user.uid);
  });
}
