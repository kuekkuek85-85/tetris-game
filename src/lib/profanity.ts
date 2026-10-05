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

export interface NicknameValidation {
  valid: boolean;
  reason?: string;
}

/** 닉네임 유효성 검사: 길이 + 금칙어 */
export function validateNickname(raw: string): NicknameValidation {
  const nickname = raw.trim();
  if (nickname.length < 1) {
    return { valid: false, reason: "닉네임을 입력해 주세요." };
  }
  if (nickname.length > 12) {
    return { valid: false, reason: "닉네임은 12자 이하로 입력해 주세요." };
  }
  const lower = nickname.toLowerCase().replace(/\s+/g, "");
  for (const word of BANNED_WORDS) {
    if (lower.includes(word.toLowerCase())) {
      return { valid: false, reason: "사용할 수 없는 단어가 포함되어 있어요." };
    }
  }
  return { valid: true };
}
