"use client";

import { useState } from "react";
import { usePlayer } from "./PlayerProvider";
import { validateName } from "@/lib/profanity";
import { parseStudentId } from "@/lib/studentId";

/** 시작 화면: 학번(5자리, 필수) + 성명(필수) 입력 */
export function StartForm() {
  const { profile, setProfile } = usePlayer();
  const [studentId, setStudentId] = useState(profile?.studentId ?? "");
  const [name, setName] = useState(profile?.name ?? "");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const idCheck = parseStudentId(studentId);
    if (!idCheck.valid || !idCheck.parsed) {
      setError(idCheck.reason ?? "학번을 확인해 주세요.");
      return;
    }
    const nameCheck = validateName(name);
    if (!nameCheck.valid) {
      setError(nameCheck.reason ?? "성명을 확인해 주세요.");
      return;
    }

    setError(null);
    setProfile({
      name: name.trim(),
      studentId: studentId.trim(),
      classId: idCheck.parsed.classId,
      studentNo: idCheck.parsed.studentNo,
    });
  };

  return (
    <div className="nickname-card">
      <h1>테트리스 교실</h1>
      <p className="lead">학번과 성명을 입력하고 바로 시작하세요. 로그인은 필요 없어요.</p>
      <form onSubmit={handleSubmit}>
        <label>
          <span>
            학번 (5자리) <em>*필수</em>
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value.replace(/\D/g, "").slice(0, 5))}
            placeholder="예) 10203 (1학년 2반 3번)"
            maxLength={5}
            autoFocus
            required
          />
        </label>
        <label>
          <span>
            성명 <em>*필수</em>
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예) 홍길동"
            maxLength={12}
            required
          />
        </label>
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
        학번은 반·순위 집계에 사용됩니다. 이메일·전화번호는 수집하지 않아요.
      </p>
    </div>
  );
}
