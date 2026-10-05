# 테트리스 교실 🎮

중학교 정보 수업용 1인 테트리스 웹 게임 + 대시보드.
설치·로그인 없이 브라우저에서 바로 플레이하고, 교사가 학급 참여 현황을 한 화면에서 확인할 수 있습니다.

> 설계·구현: Claude Code · 코드 리뷰: Codex · 배포: Vercel · 데이터: Firebase

## 주요 기능

- **표준 테트리스**: 10×20 보드, 7종 테트로미노, 7-bag 랜덤, SRS 월킥, 홀드/넥스트, 고스트 블록
- **점수·레벨**: PRD 점수표(싱글 100 ~ 테트리스 800 × 레벨), 8줄마다 레벨 상승 및 낙하 속도 증가
- **아이템**: 라인 소거로 게이지 충전 → 💣 폭탄 · ✂️ 라인 소거 · 🐢 슬로우 획득(키 1/2/3)
- **조작**: 키보드 + 터치(버튼·스와이프) 완전 지원, 키보드만으로도 플레이 가능
- **대시보드**: 개인 기록(전체 순위 + 우리 반 순위), 학급 리더보드(반별 필터), 교사용 현황(반별 통계·CSV 내보내기)
- **식별**: 학번(5자리) + 성명 입력 → 학번에서 학년·반·번호 자동 추출. Firebase 익명 인증으로 로그인 없이 식별
- **오프라인 폴백**: Firebase 미설정/차단 시 자동으로 localStorage 에 기록 저장 — 수업이 끊기지 않음

## 기술 스택

| 영역 | 도구 |
| --- | --- |
| 프런트엔드 | Next.js 14 (App Router) · React 18 · TypeScript |
| 인증 | Firebase Auth (익명) |
| 데이터 | Cloud Firestore |
| 배포 | Vercel |

게임 로직(`src/lib/tetris`)은 순수 함수로 작성되어 있어 렌더링과 분리되고 단위 테스트가 가능합니다.

## 시작하기

```bash
npm install
cp .env.example .env.local   # Firebase 값 입력 (비워두면 로컬 전용 모드)
npm run dev                  # http://localhost:3000
```

### 환경 변수

`.env.local` 에 Firebase 설정을 넣습니다. **비워두면 게임은 그대로 동작하고 기록은 브라우저에만 저장됩니다.**

| 변수 | 설명 |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` 등 | Firebase 웹 앱 설정값 |
| `NEXT_PUBLIC_TEACHER_ACCESS_CODE` | 교사용 현황 페이지 접근 코드(선택) |

## 스크립트

```bash
npm run dev        # 개발 서버
npm run build      # 프로덕션 빌드
npm run start      # 빌드 결과 실행
npm run lint       # ESLint
npm run typecheck  # 타입 검사
npm run test       # 게임 엔진 단위 테스트 (Vitest)
```

## 조작법

| 동작 | 키보드 | 터치 |
| --- | --- | --- |
| 이동 | ← → | 버튼 / 좌우 스와이프 |
| 회전 | ↑ (또는 Z 반시계) | 회전 버튼 / 탭 |
| 소프트 드롭 | ↓ | 버튼 / 아래 스와이프 |
| 하드 드롭 | Space | 버튼 / 아래 플릭 |
| 홀드 | Shift 또는 C | 버튼 |
| 일시정지 | P 또는 Esc | 버튼 |

## 데이터 모델 (Firestore)

- `players/{uid}` — nickname(성명), studentId(학번), classId(학년-반), studentNo, bestScore, playCount, totalLines, totalPlayMs, 시각
- `games/{autoId}` — uid, nickname(성명), classId, score, lines, level, durationMs, playedAt
  - 학번 5자리는 `학년(1) + 반(2) + 번호(2)` 구조로, classId(`학년-반`)와 studentNo를 자동 파생합니다.
  - **학번(studentId)은 공개 컬렉션인 `games`에 저장하지 않고, 본인만 읽는 `players` 문서에만 보관합니다.** (학생 간 식별자 노출 방지) 교사용 목록·CSV는 성명·반으로 식별하며, 학번 전체 열람이 필요하면 서버 검증 권한(커스텀 클레임/Cloud Function)이 추가로 필요합니다.

보안 규칙은 `firestore.rules`, 복합 인덱스는 `firestore.indexes.json` 에 정의되어 있습니다.

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## 프로젝트 구조

```
src/
  app/              # Next.js App Router 페이지 (게임/대시보드/리더보드/교사용)
  components/       # UI 컴포넌트 (보드, 미리보기, 터치 조작, 폼 등)
  hooks/            # useTetris (게임 루프 + 입력 처리)
  lib/
    tetris/         # 순수 게임 엔진 (상태·충돌·회전·점수) + 단위 테스트
    firebase/       # Firebase 초기화·인증 (미설정 시 폴백)
    records/        # 기록 저장소 파사드 (Firestore / localStorage)
    stats.ts        # 교사용 집계·CSV
```

## 개인정보 보호

PRD 7절 원칙(최소 수집·목적 제한·안전한 삭제)을 지향하되, **운영자 요청에 따라 학번(5자리)과 성명(실명)을 수집**합니다.
이메일·전화번호는 수집하지 않습니다. 수집 항목은 다음과 같습니다.

- **성명(실명)**: `players`와 **공개 읽기 가능한 `games`** 문서에 저장되며, **리더보드에 학생 간 공개로 표시**됩니다.
- **학번(5자리)**: 본인만 읽는 `players` 문서에만 저장하고, 공개 컬렉션 `games`·리더보드에는 노출하지 않습니다. (학번에서 학년·반·번호를 파생)

실명이 학생 간에 공개되는 설계이므로, 실제 운영 전 **학교 개인정보 보호 지침과의 적합성 확인**이 반드시 필요합니다.
운영 종료 후에는 교사가 기록을 삭제(초기화)할 수 있어야 합니다.
