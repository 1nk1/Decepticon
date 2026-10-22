# Decepticon 개선 설계 — Claude Code 리버싱 기반 (2026-10-22)

경계: **LangGraph 배제** — Anthropic Messages API + Claude Code 자체 구현의 아키텍처 패턴을 추출하여 LangGraph 체계에 맞게 재설계. 멀티서페이스: CLI(로컬 모드, 현재) + Desktop 앱(추후, 로컬/cloud 모드). OSS web 대시보드는 세션 계약 대상 아님.

## 이미 완료 (병합/PR 대기)

### 병합 완료

| PR | 내용 | 이슈 |
|---|---|---|
| #1035 | launcher docs 잔여 완수 + unknown command 제안 | #1018 |
| #1036 | TUI 토큰 스트리밍 + pendingTool 헤더 | #1032 |
| #1047 | certifi 보안 bump (PYSEC-2026-4320) | — |

### PR 대기 (병합 필요)

| PR | 내용 | 이슈 | 상태 |
|---|---|---|---|
| #1038 | TUI 슬래시 UX (완성 6커맨드 + 제안 + /help 카테고리) | #1033 | CONFLICTING |
| #1039 | TUI 에러 폴리시 (esc dismiss + 숫자키 + footer 조건화 + 죽은 코드 삭제) | #1034 부분 | CONFLICTING |
| #1045 | MCP start_engagement workspace_path 바인딩 | #1042 | CONFLICTING |
| #1046 | doctor --deep (슬롯 매트릭스 + KG + Skillogy + MCP auth) | #1040 부분 | CONFLICTING |
| #1048 | --model 플래그 (DECEPTICON_MODEL_OVERRIDE → CLI) | #1044 부분 | MERGEABLE |
| #1049 | 배경 engagement lifecycle (--background + attach + engagements) | #1041 첫 슬라이스 | MERGEABLE |

### 이슈 #1032 종결 확인 (PR #1036 병합으로)

---

## 남은 개선 설계

### Phase 1 — 즉시 구현 가능 (기존 미들웨어 확장)

#### 1-1. 구조화된 에러 + 복구 안내

**Claude Code 패턴:**
```text
에러 = 원인 + 현재 상태 + 입력 형식 + 복구 방법
resume 실패: Usage + 실패 사유 + failure_reason
파일 권한: 정책 차단 안내 + 설정 변경 방법
```

**Decepticon 현재:**
- ops 도구는 actionable error 패턴 보유 (`tools/ops/tools.py:42-52`)
- bash/web/reporting 도구는 일반 예외 메시지만

**설계:**
- `tools/errors.py` 신규 — 공통 에러 래퍼
- 도구 결과에 `is_error`, `cause`, `recovery` 필드 추가
- ops 도구 패턴을 bash/web/reporting으로 확장
- TUI `ErrorMessage`가 cause/recovery를 구분 표시

**LangGraph 매핑:** 도구 노드의 예외 처리 → 구조화 dict 반환 → TUI가 파싱

**구현 파일:** `tools/errors.py` 신규, 기존 도구 모듈 래퍼 교체, `ErrorMessage.tsx` 확장

#### 1-2. 토큰 예산 가시성

**Claude Code 패턴:**
```text
stop_reason: budget_exhausted
"Output tokens spent this turn toward the token budget"
```

**Decepticon 현재:**
- BudgetMiddleware: `budget_warning`(70%) + `BudgetExceeded`(100%) + `spend_untracked` 구현됨
- TUI가 이 이벤트를 렌더링하는지 확인 필요

**설계:**
- TUI footer에 budget 사용률 표시: `Red · my-engagement · model · budget 45% · connection`
- `budget_warning` 커스텀 이벤트가 TUI에 도달하는지 검증
- 런처 `--budget-limit <USD>` 플래그 → configurable로 전달

**LangGraph 매핑:** BudgetMiddleware의 커스텀 이벤트 → LangGraph 커스텀 스트림 → TUI 수신

**구현 파일:** `middleware/budget.py` (검증), `useAgent.ts` (커스텀 이벤트 수신), `REPL.tsx` (footer 확장), `start.go` (플래그)

#### 1-3. 컴팩션 경계 마킹

**Claude Code 패턴:**
```text
PreCompact 훅 → 컴팩션 → compact_boundary 마킹 → PostCompact 훅
"Summarize from here" / "Summarize up to here"
```

**Decepticon 현재:**
- `_SafeSummarizationProxy`: 요약 실패 시 무음 생략 (경고 1줄)
- 컴팩션 경계 마킹 없음
- PreCompact/PostCompact 훅 없음

**설계:**
- 요약 성공 → `compact_boundary` 시스템 메시지를 state에 삽입
- 요약 실패 → `summarization_skipped` 이벤트 발화 (무음 생략 해소)
- PreCompact/PostCompound 이벤트 발화

**LangGraph 매핑:** SummarizationMiddleware 확장 → state에 경계 메시지 삽입 → event_log에 이벤트

**구현 파일:** `middleware_slots.py` (_SafeSummarizationProxy 확장), `middleware/event_logging.py` (이벤트 추가)

---

### Phase 2 — 중간 볼륨 (새 미들웨어 또는 기존 확장)

#### 2-1. 도구별 권한 정책

**Claude Code 패턴:**
```text
3계층 권한 체크:
  모드 (default/acceptEdits/bypassPermissions/plan)
  + 도구별 정책 (builtinToolPolicy: {Bash: "allow", Write: "ask", ...})
  + glob 룰 (builtinToolRules)
→ 통과해야 도구 실행
```

**Decepticon 현재:**
- HITL 미들웨어: binary (enable/disable), `tool_pattern` 매칭 존재, `ApprovalTransport` 프로토콜 존재
- `SAFETY_CRITICAL_TOOLS` 세트 존재

**설계:**
- HITL 미들웨어 확장: `tool_policy` configurable 맵 주입
- 도구별 정책: `{tool_name: "allow"|"ask"|"deny"}` 
- 권한 모드: `plan`(읽기 전용) 모드에서 쓰기 도구 차단
- `SAFETY_CRITICAL_TOOLS`는 정책이 "allow"여도 항상 ask
- TUI에 승인 프롬프트 표시 (기존 ApprovalTransport 활용)

**LangGraph 매핑:** HITL 미들웨어의 `wrap_tool_call`에서 정책 조회 → deny면 스킵, ask면 interrupt() → 사용자 승인 대기

**구현 파일:** `middleware/hitl.py` 확장, `agents/build.py` (tool_policy 전달), TUI 승인 프롬프트

#### 2-2. 도구 수명주기 훅

**Claude Code 패턴:**
```text
PreToolUse → 도구 실행 → PostToolUse / PostToolUseFailure → PostToolBatch
24개 이벤트, 매처(matcher) 지원
```

**Decepticon 현재:**
- EventLogMiddleware: `wrap_tool_call`에서 tool_call/tool_result 이벤트 발화
- 사용자 구성 가능 콜백 없음

**설계:**
- `middleware/hooks.py` 신규 — 훅 디스패처
- 훅 구성: configurable로 전달 `{event: [{matcher, action}]}`
- EventLogMiddleware의 `wrap_tool_call` 전후에 훅 발화
- 훅 액션: 로그, 알림, 커스텀 함수

**LangGraph 매핑:** 미들웨어 `wrap_tool_call`의 전후 삽입점이 LangGraph의 미들웨어 패턴과 동일

**구현 파일:** `middleware/hooks.py` 신규, `middleware/event_logging.py` (훅 발화 삽입), `agents/build.py` (훅 구성 전달)

#### 2-3. 세션 내 /doctor

**Claude Code 패턴:**
```text
claude doctor (호스트 진단, 읽기전용) vs /doctor (세션 내 전체 점검)
```

**Decepticon 현재:**
- `decepticon doctor --deep` (PR #1046): 호스트 측 진단 구현됨
- 세션 내 /doctor 없음

**설계:**
- TUI `/doctor` 커맨드 신규
- 현재 engagement의 상태 표시:
  - scope/ROE 승인 상태
  - OPPLAN revision
  - workflow snapshot pins (id/version/sha)
  - 활성 체크포인트
  - 플러그인 번들 상태
  - budget 사용률
  - 슬롯 생존 상태 (PR #1046의 diagnostics 모듈 결과)
- 읽기 전용, 수정 없음

**LangGraph 매핑:** TUI가 LangGraph API로 engagement state를 조회 → 표시

**구현 파일:** `commands/doctor.ts` 신규, TUI에서 LangGraph API 호출

---

### Phase 3 — 설계 합의 필요 (멀티서페이스·확장)

#### 3-1. 멀티서페이스 세션 계약

**Claude Code 패턴:**
```text
--bg → agents → attach → logs → stop/kill → rm
--cloud / --desktop / --teleport
```

**Decepticon 멀티서페이스:**
```text
CLI (로컬 모드) — 현재 OSS, 로컬 스택 대상
Desktop 앱 (추후 공개)
  ├── 로컬 모드 → 로컬 Decepticon 스택 (CLI engagements)
  └── cloud 모드 → Decepticon prod (별도 웹 SaaS)

세션 계약 대상 아님:
  OSS web dashboard (clients/web) — 독립 Next.js 대시보드
```

**설계:**
- 세션 계약: list / start (attached/detached) / attach / observe / message / cancel
- 어댑터: Desktop(local mode) → 로컬 스택, Desktop(cloud mode) → prod API
- 보안 불변식: Red scope 승인 게이트를 모든 표면에 동일 적용
- deprecated desktop의 `docker compose` 직접 호출 문제 해결

**전제:** Desktop 앱 구현 시작 전 세션 계약 형태 합의 필요

**관련 이슈:** #1043, #1041 (PR #1049가 첫 슬라이스)

#### 3-2. 배경 engagement 후속 슬라이스

**PR #1049 완수 후:**
- `decepticon logs <name>` — transcript 커서 재생 + 서비스 로그
- `decepticon cancel <name>` — 개별 engagement 취소 (stop 전체 스택과 분리)

#### 3-3. fallback/effort/autocompact 계약

**Claude Code 패턴:**
```text
--fallback-model <model> — 모델 fallback 체인
--effort <level> — reasoning 깊이
--autocompact <auto|tokens> — 자동 컴팩션 임계값
```

**Decepticon 현재:**
- fallback: credentials 우선순위 체인 기반 (env 아님 — 팩토리 훅 필요)
- effort: 프로바이더별 키 (`DECEPTICON_GPT_EFFORT`, `DECEPTICON_CLAUDE_EFFORT_*`)
- autocompact: summarization middleware의 config

**설계:**
- 팩토리에 per-run override 훅 추가 (model_override 패턴과 유사)
- effort를 통합 키로 정규화 (프로바이더별 매핑)
- autocompact 임계값을 configurable로 전달

**구현 파일:** `llm/factory.py` (override 훅), `middleware_slots.py` (summarization 확장)

#### 3-4. 비대화형 실행 (JSONL)

**Claude Code 패턴:**
```text
-p --output-format json|stream-json --input-format stream-json
```

**Decepticon 현재:**
- MCP bridge가 headless 제어 제공 (start/transcript/send_message/cancel)
- coding agent용 operator 스킬 존재 (SKILL.md v2.1.0)
- 비대화형 JSONL CLI 없음

**판정:** MCP + 스킬로 충분히 커버됨 — 신규 JSONL CLI는 불필요. 단, `start_engagement`의 workspace 바인딩( PR #1045)과 HITL 승인의 MCP 경로가 완성되면 coding agent의 완전 자동화가 가능

---

## 우선순위 전체 요약

| Phase | 항목 | 난이도 | 영향 | 선행 조건 |
|---|---|---|---|---|
| 1 | 1-1 구조화 에러 | 낮음 | 높음 | 없음 |
| 1 | 1-2 토큰 예산 가시성 | 낮음 | 높음 | 없음 |
| 1 | 1-3 컴팩션 경계 마킹 | 중간 | 높음 | 없음 |
| 2 | 2-1 도구별 권한 정책 | 높음 | 높음 | 없음 |
| 2 | 2-2 도구 수명주기 훅 | 높음 | 중간 | 없음 |
| 2 | 2-3 세션 /doctor | 중간 | 중간 | PR #1046 병합 |
| 3 | 3-1 멀티서페이스 세션 계약 | 높음 | 높음 | Desktop 설계 합의 |
| 3 | 3-2 배경 후속 슬라이스 | 중간 | 중간 | PR #1049 병합 |
| 3 | 3-3 fallback/effort 계약 | 높음 | 중간 | 팩토리 훅 설계 |
| 3 | 3-4 비대화형 JSONL | — | — | 불필요 (MCP+스킬로 커버) |

## CONFLICTING PR 리베이스

4개 PR이 CONFLICTING 상태 — 최신 main(bb41f2a 이후 b2d1080)에 리베이스 필요:

| PR | 충돌 파일 | 해결 방법 |
|---|---|---|
| #1038 | CHAGELOG.md, 클라이언트 파일 | upstream 변경 반영 + 내 변경 유지 |
| #1039 | CHAGELOG.md | upstream changelog 엔트리 병합 |
| #1045 | CHAGELOG.md, mcp 파일 | upstream 변경 반영 + 내 workspace_path 유지 |
| #1046 | CHAGELOG.md, diagnostics.py | upstream 변경 반영 + 내 진단 모듈 유지 |

#1036(토큰 스트리밍)이 병합됐으므로 #1038의 tsc 오류(useAgent.ts 충돌)도 확인 필요.