/** ms 를 "분:초" 형태로 */
export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

/** epoch ms 를 로케일 날짜/시간 문자열로 */
export function formatDateTime(ms: number): string {
  try {
    return new Date(ms).toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(ms).toISOString();
  }
}

/** 숫자를 천 단위 콤마로 */
export function formatNumber(n: number): string {
  return n.toLocaleString("ko-KR");
}
