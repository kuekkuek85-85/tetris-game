"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePlayer } from "@/components/PlayerProvider";
import {
  getMyGames,
  getPlayer,
  getRanks,
  type GameRecord,
  type PlayerAggregate,
} from "@/lib/records";
import { formatDateTime, formatDuration, formatNumber } from "@/lib/format";

export default function DashboardPage() {
  const { uid, profile, authReady } = usePlayer();
  const [player, setPlayer] = useState<PlayerAggregate | null>(null);
  const [games, setGames] = useState<GameRecord[]>([]);
  const [overallRank, setOverallRank] = useState<number | null>(null);
  const [classRank, setClassRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const classId = profile?.classId || null;

  useEffect(() => {
    if (!authReady || !uid) return;
    let active = true;
    setLoading(true);
    Promise.all([
      getPlayer(uid),
      getMyGames(uid, 10),
      getRanks(uid, classId), // 전체·반 순위를 한 번의 조회로 계산
    ])
      .then(([p, g, ranks]) => {
        if (!active) return;
        setPlayer(p);
        setGames(g);
        setOverallRank(ranks.overall);
        setClassRank(ranks.classRank);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [authReady, uid, classId]);

  if (!authReady || loading) {
    return <div className="centered-state"><p>불러오는 중…</p></div>;
  }

  if (!profile) {
    return (
      <div className="centered-state">
        <p>먼저 학번과 성명을 입력하고 게임을 시작해 주세요.</p>
        <Link className="primary-btn" href="/">게임으로 이동</Link>
      </div>
    );
  }

  return (
    <div className="page dashboard">
      <header className="page-header">
        <h1>내 기록</h1>
        <p className="muted">
          {profile.name}
          {profile.classId ? ` · ${profile.classId.replace("-", "학년 ")}반` : ""}
          {profile.studentNo != null ? ` ${profile.studentNo}번` : ""}
          {` · 학번 ${profile.studentId}`}
        </p>
      </header>

      {!player ? (
        <div className="empty-state">
          <p>아직 기록이 없어요. 한 판 플레이해 볼까요?</p>
          <Link className="primary-btn" href="/">게임 시작</Link>
        </div>
      ) : (
        <>
          <section className="stat-grid">
            <StatCard label="최고 점수" value={formatNumber(player.bestScore)} />
            <StatCard label="총 플레이" value={`${player.playCount}판`} />
            <StatCard label="누적 라인" value={formatNumber(player.totalLines)} />
            <StatCard label="누적 시간" value={formatDuration(player.totalPlayMs)} />
            <StatCard label="전체 순위" value={overallRank ? `${overallRank}위` : "-"} />
            {classId && (
              <StatCard
                label={`우리 반 순위 (${classId})`}
                value={classRank ? `${classRank}위` : "-"}
              />
            )}
          </section>

          <section className="table-section">
            <h2>최근 기록</h2>
            {games.length === 0 ? (
              <p className="muted">최근 기록이 없어요.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>일시</th>
                      <th>점수</th>
                      <th>라인</th>
                      <th>레벨</th>
                      <th>시간</th>
                    </tr>
                  </thead>
                  <tbody>
                    {games.map((g) => (
                      <tr key={g.id}>
                        <td>{formatDateTime(g.playedAt)}</td>
                        <td>{formatNumber(g.score)}</td>
                        <td>{g.lines}</td>
                        <td>{g.level}</td>
                        <td>{formatDuration(g.durationMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
