"use client";

import { useState } from "react";
import { usePlayer } from "./PlayerProvider";
import { validateNickname } from "@/lib/profanity";

/** 시작 화면: 닉네임(필수) + 반/번호(선택) 입력 */
export function NicknameForm() {
  const { profile, setProfile } = usePlayer();
  const [nickname, setNickname] = useState(profile?.nickname ?? "");
  const [classId, setClassId] = useState(profile?.classId ?? "");
  const [studentNo, setStudentNo] = useState(
    profile?.studentNo != null ? String(profile.studentNo) : "",
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateNickname(nickname);
    if (!check.valid) {
      setError(check.reason ?? "닉네임을 확인해 주세요.");
      return;
    }
    const parsedNo = studentNo.trim() === "" ? null : Number(studentNo);
    if (parsedNo !== null && (!Number.isInteger(parsedNo) || parsedNo < 0)) {
      setError("번호는 0 이상의 정수로 입력해 주세요.");
      return;
    }
    setError(null);
    setProfile({
      nickname: nickname.trim(),
      classId: classId.trim(),
      studentNo: parsedNo,
    });
  };

  return (
    <div className="nickname-card">
      <h1>테트리스 교실</h1>
      <p className="lead">닉네임을 입력하고 바로 시작하세요. 로그인은 필요 없어요.</p>
      <form onSubmit={handleSubmit}>
        <label>
          <span>
            닉네임 <em>*필수</em>
          </span>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="예) 블록마스터"
            maxLength={12}
            autoFocus
            required
          />
        </label>
        <div className="form-row">
          <label>
            <span>반 (선택)</span>
            <input
              type="text"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              placeholder="예) 1-3"
              maxLength={10}
            />
          </label>
          <label>
            <span>번호 (선택)</span>
            <input
              type="number"
              value={studentNo}
              onChange={(e) => setStudentNo(e.target.value)}
              placeholder="예) 12"
              min={0}
              max={100}
            />
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="primary-btn full">
          시작하기
        </button>
      </form>
      <p className="privacy-note">
        실명·이메일은 수집하지 않아요. 닉네임만 리더보드에 표시됩니다.
      </p>
    </div>
  );
}
