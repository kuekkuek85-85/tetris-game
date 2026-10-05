"use client";

import { useEffect, useMemo, useState } from "react";
import { usePlayer } from "@/components/PlayerProvider";
import { getLeaderboard, type GameRecord } from "@/lib/records";
import { formatDateTime, formatNumber } from "@/lib/format";

type Scope = "all" | "class";

export default function LeaderboardPage() {
  const { uid, profile, authReady } = usePlayer();
  const [scope, setScope] = useState<Scope>("all");
  const [records, setRecords] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const classId = profile?.classId || null;

  useEffect(() => {
    if (!authReady) return;
    let active = true;
    setLoading(true);
    const filterClass = scope === "class" ? classId : null;
    getLeaderboard(filterClass, 50)
      .then((r) => active && setRecords(r))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [authReady, scope, classId]);

  // 동점 시 달성 시각 빠른 순 (score desc, playedAt asc)
  const sorted = useMemo(
    () => [...records].sort((a, b) => b.score - a.score || a.playedAt - b.playedAt),
    [records],
  );

  return (
    <div className="page leaderboard">
      <header className="page-header">
        <h1>학급 리더보드</h1>
        <div className="scope-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={scope === "all"}
            className={scope === "all" ? "active" : undefined}
            onClick={() => setScope("all")}
          >
            전체
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={scope === "class"}
            className={scope === "class" ? "active" : undefined}
            onClick={() => setScope("class")}
            disabled={!classId}
            title={classId ? undefined : "반을 입력하면 반별로 볼 수 있어요"}
          >
            우리 반{classId ? ` (${classId})` : ""}
          </button>
        </div>
      </header>

      {loading ? (
        <p className="muted">불러오는 중…</p>
      ) : sorted.length === 0 ? (
        <div className="empty-state">
          <p>아직 기록이 없어요. 가장 먼저 이름을 올려보세요!</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="rank-table">
            <thead>
              <tr>
                <th>순위</th>
                <th>닉네임</th>
                <th>점수</th>
                <th>라인</th>
                <th>레벨</th>
                <th>일시</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.id} className={r.uid === uid ? "me" : undefined}>
                  <td>
                    <span className={`rank-badge rank-${i + 1 <= 3 ? i + 1 : "n"}`}>
                      {i + 1}
                    </span>
                  </td>
                  <td>
                    {r.nickname}
                    {r.uid === uid ? <span className="me-tag">나</span> : null}
                  </td>
                  <td>{formatNumber(r.score)}</td>
                  <td>{r.lines}</td>
                  <td>{r.level}</td>
                  <td className="muted">{formatDateTime(r.playedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
