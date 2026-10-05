// 학번(5자리) 파싱: 학년(1) + 반(2) + 번호(2)
// 예) "10203" → 학년 1, 반 2, 번호 3, classId "1-2"

export interface ParsedStudentId {
  grade: number;
  classNo: number;
  studentNo: number;
  /** 리더보드 반별 필터용 식별값 "학년-반" (예: "1-2") */
  classId: string;
}

export interface StudentIdValidation {
  valid: boolean;
  reason?: string;
  parsed?: ParsedStudentId;
}

/** 학번 문자열을 검증하고 파싱한다. 5자리 숫자여야 한다. */
export function parseStudentId(raw: string): StudentIdValidation {
  const value = raw.trim();
  if (!/^\d{5}$/.test(value)) {
    return { valid: false, reason: "학번은 숫자 5자리로 입력해 주세요. (예: 10203)" };
  }
  const grade = Number(value.slice(0, 1));
  const classNo = Number(value.slice(1, 3));
  const studentNo = Number(value.slice(3, 5));

  if (grade < 1) {
    return { valid: false, reason: "학년(첫 자리)은 1 이상이어야 해요." };
  }
  return {
    valid: true,
    parsed: {
      grade,
      classNo,
      studentNo,
      classId: `${grade}-${classNo}`,
    },
  };
}
