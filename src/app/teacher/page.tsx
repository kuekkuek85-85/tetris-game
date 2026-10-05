"use client";

import { useEffect, useMemo, useState } from "react";
import { usePlayer } from "@/components/PlayerProvider";
import { getAllGames, type GameRecord } from "@/lib/records";
import { computeClassStats, countParticipants, gamesToCsv } from "@/lib/stats";
import { formatDateTime, formatNumber } from "@/lib/format";

const ACCESS_CODE = process.env.NEXT_PUBLIC_TEACHER_ACCESS_CODE ?? "";

export default function TeacherPage() {
  const { authReady } = usePlayer();
  const [unlocked, setUnlocked] = useState(ACCESS_CODE === "");
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState(false);

  const [games, setGames] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [openClass, setOpenClass] = useState<string | null>(null);

  useEffect(() => {
    if (!authReady || !unlocked) return;
    let active = true;
    setLoading(true);
    getAllGames()
      .then((g) => {
        if (active) setGames(g);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [authReady, unlocked]);

  const classStats = useMemo(() => computeClassStats(games), [games]);
  const participantCount = useMemo(() => countParticipants(games), [games]);

  const gamesByClass = useMemo(() => {
    const map = new Map<string, GameRecord[]>();
    for (const g of games) {
      const key = g.classId || "(미지정)";
      const list = map.get(key) ?? [];
      list.push(g);
      map.set(key, list);
    }
    return map;
  }, [games]);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (codeInput === ACCESS_CODE) {
      setUnlocked(true);
      setCodeError(false);
    } else {
      setCodeError(true);
    }
  };

  const handleExport = () => {
    const csv = gamesToCsv(games);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tetris-records-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!unlocked) {
    return (
      <div className="centered-state">
        <form className="nickname-card" onSubmit={handleUnlock}>
          <h1>교사용 현황</h1>
          <p className="lead">접근 코드를 입력해 주세요.</p>
          <label>
            <span>접근 코드</span>
            <input
              type="password"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              autoFocus
            />
          </label>
          {codeError && (
            <p className="form-error" role="alert">
              코드가 올바르지 않습니다.
            </p>
          )}
          <button type="submit" className="primary-btn full">
            확인
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="page teacher">
      <header className="page-header">
        <h1>교사용 현황</h1>
        <button
          type="button"
          className="secondary-btn"
          onClick={handleExport}
          disabled={games.length === 0}
        >
          CSV 내보내기
        </button>
      </header>

      {loading ? (
        <p className="muted">불러오는 중…</p>
      ) : (
        <>
          <section className="stat-grid">
            <div className="stat-card">
              <span className="stat-label">참여 학생</span>
              <span className="stat-value">{participantCount}명</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">총 플레이</span>
              <span className="stat-value">{games.length}판</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">반 수</span>
              <span className="stat-value">{classStats.length}개</span>
            </div>
          </section>

          <section className="table-section">
            <h2>반별 통계</h2>
            {classStats.length === 0 ? (
              <p className="muted">아직 기록이 없어요.</p>
            ) : (
              <div className="class-list">
                {classStats.map((stat) => {
                  const open = openClass === stat.classId;
                  const classGames = (gamesByClass.get(stat.classId) ?? [])
                    .slice()
                    .sort((a, b) => b.score - a.score);
                  return (
                    <div className="class-item" key={stat.classId}>
                      <button
                        type="button"
                        className="class-head"
                        aria-expanded={open}
                        onClick={() => setOpenClass(open ? null : stat.classId)}
                      >
                        <span className="class-name">{stat.classId}</span>
                        <span className="class-meta">
                          참여 {stat.playerCount}명 · 평균 {formatNumber(stat.avgScore)} ·
                          최고 {formatNumber(stat.bestScore)}
                        </span>
                        <span className="chevron">{open ? "▲" : "▼"}</span>
                      </button>
                      {open && (
                        <div className="table-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>닉네임</th>
                                <th>점수</th>
                                <th>라인</th>
                                <th>레벨</th>
                                <th>일시</th>
                              </tr>
                            </thead>
                            <tbody>
                              {classGames.map((g) => (
                                <tr key={g.id}>
                                  <td>{g.nickname}</td>
                                  <td>{formatNumber(g.score)}</td>
                                  <td>{g.lines}</td>
                                  <td>{g.level}</td>
                                  <td className="muted">{formatDateTime(g.playedAt)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
