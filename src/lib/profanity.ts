// 간단한 닉네임 금칙어 필터 (수업 운영용 최소 수준)

const BANNED_WORDS = [
  "씨발",
  "시발",
  "fuck",
  "shit",
  "병신",
  "지랄",
  "개새",
  "좆",
  "엠창",
  "fuxk",
];

export interface NameValidation {
  valid: boolean;
  reason?: string;
}

/** 성명 유효성 검사: 길이 + 금칙어 (리더보드 표시명이자 Firestore nickname 필드로 저장) */
export function validateName(raw: string): NameValidation {
  const name = raw.trim();
  if (name.length < 1) {
    return { valid: false, reason: "성명을 입력해 주세요." };
  }
  // Firestore 규칙에서 nickname.size() <= 12 를 요구하므로 동일 한도 적용
  if (name.length > 12) {
    return { valid: false, reason: "성명은 12자 이하로 입력해 주세요." };
  }
  const lower = name.toLowerCase().replace(/\s+/g, "");
  for (const word of BANNED_WORDS) {
    if (lower.includes(word.toLowerCase())) {
      return { valid: false, reason: "사용할 수 없는 단어가 포함되어 있어요." };
    }
  }
  return { valid: true };
}
