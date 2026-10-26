# Blue Cell 전수 분석 — AutoBot 분리 근거

- Status: 분석 (설계 입력)
- Date: 2026-10-23
- 목적: Decepticon 안의 Blue 계열을 **하나도 빠짐없이** 해부하고, AutoBot의
  의도(= 사용자 환경에 꽂는 **SIEM급 디펜스 시스템**, **로그 커버리지를
  플러그인으로 추가**, **에이전트가 모든 이벤트 열람**, 최종 **탐지 → 조사 →
  대응(detect → investigate → respond)**)에 맞춰 무엇을 떼고 무엇을 고쳐야
  하는지 확정한다.

> **방향 (2026-10-23 사용자):**
> - **최종 목표: AutoBot = 탐지 → 조사 → 대응**의 완전한 방어 루프.
> - **단기 목표: 탐지(+조사) 중심으로 System B 분리** + 커버리지 플러그인.
> - 현 OSS Blue Cell은 **탐지·조사까지(read-only)** — telemetry-design.md가
>   observe-and-report를 response와 분리. **대응(response) 레이어가 최종 목표의
>   미구현 부분.** 이는 (a) `tools/defense`의 SIEM/EDR push 연결기를 "응답
>   액션"으로 재분류하고(아래 §0·§5), (b) 응답은 outward/비가역이므로 **승인·
>   스코프·dry-run 가드레일**을 핵심 설계 요소로 끌어올린다는 뜻이다.
- 근거: 코드 직접 정독(파일·라인 아래 표기). 커밋/푸시 없음.

---

## 0. 핵심 발견 — Blue 안에 "두 개의 시스템"이 섞여 있다

| | **System B — 독립 센서/SIEM** (= AutoBot 의도) | **System A — Offensive Vaccine / KG 탐지** (= Purple → Cybertron) |
|---|---|---|
| 성격 | 사용자 환경의 로그를 상시 수집·탐지·조사하는 **독립 디펜스** | Red 엔게이지먼트 산출물(공격)을 탐지 커버리지와 **상관·검증** |
| 입력 | 실제 타깃 로그/프록시/센서 (Red와 무관) | Red 샌드박스 세션 로그 replay |
| 저장 | 센서 SQLite(정규화 이벤트) + 모니터 SQLite(인시던트) | Knowledge Graph (`DetectionFired` 노드) |
| 산출 | 인시던트·알림·증거 열람 | MTTD, detection-gap, SIEM push |
| 에이전트 | read-only Blue agent (센서 HTTP 툴) | Red 파이프라인의 Defender/Patcher |
| **귀속** | **AutoBot (이번 분리 대상)** | **Cybertron (후속) — Decepticon 잔류** |

이 구분이 분리선의 근거다. 사용자가 말한 "SIEM급, 커버리지 플러그인,
에이전트가 모든 이벤트 열람"은 **전적으로 System B**다.

**단, "탐지 → 대응" 방향이 System A의 일부를 재분류한다.** `tools/defense`의
SIEM/EDR **push 연결기**(sigma_to_splunk/sentinel/elastic, yara_to_defender/
crowdstrike)는 "탐지를 방어 스택에 **배포/적용**하는 응답 액션"이다. 따라서
**연결기 자체는 AutoBot의 대응 레이어로** 간다. 반면 그 룰을 **Red 공격으로부터
자동 생성**하는 vaccine orchestration(Detector/Patcher, KG DetectionFired,
red↔blue 상관)은 Cybertron에 남는다. 즉:

- **AutoBot (System B + 대응)** = 탐지(센서·룰·조사) + **대응(SIEM/EDR 배포,
  인그레스 차단, 케이스 액션)**. 응답의 **입력(룰·탐지)**은 AutoBot 자체 탐지든
  Cybertron이 넘긴 것이든 무관.
- **Cybertron (System A의 orchestration)** = red↔blue를 잇는 vaccine 루프·KG·
  MTTD/gap 상관. AutoBot의 탐지·대응을 **위에서 조율**.

(intent.md 질문 C 경계를 이 방향에 맞춰 갱신)

---

## 1. 전수 인벤토리 (파일별 분류)

### 1.1 Python 프레임워크 — `packages/decepticon/decepticon/`

| 파일 (라인) | 역할 | 시스템 | 조치 |
|---|---|---|---|
| `blue_cell/__init__.py` (44) | 패키지 export (Tap·RuleMatcher·DetectionEvent) | A/공용 | 라이브러리 — 당분간 잔류, 추후 Cybertron |
| `blue_cell/tap.py` (216) | 샌드박스 tmux + 타깃 사이드카 로그를 `TapEvent`로 정규화. batch/follow tail | A | Cybertron (Red 샌드박스 로그 소비) |
| `blue_cell/rule_match.py` (241) | Sigma-flavored regex 룰 매처, MTTD 스코어 | A/공용 | 룰 엔진은 B도 재사용 가능 → §3.4 |
| `blue_cell/sample_rules.jsonl` (10) | 부트스트랩 룰 | 공용 | 양쪽 참조 |
| `agents/standard/blue_cell.py` (103) | **read-only Blue 에이전트** 팩토리 + `graph` + `SUBAGENT_SPEC`. 5개 센서 툴 + blue 프롬프트. bash 없음 | **B** | **→ AutoBot** |
| `tools/defense/blue_sensor.py` (170) | **5개 센서 read 툴**(`blue_sensor_scan/events/search/timeline/body`) — receiver·monitor HTTP 호출 | **B** | **→ AutoBot** |
| `tools/defense/blue_cell.py` (229) | `blue_cell_scan` — 샌드박스 로그 replay→KG `DetectionFired`·MTTD·gap | A | Cybertron |
| `tools/defense/tools.py` (208) | `DEFENSE_TOOLS` — `sigma_to_splunk/sentinel/elastic`, `yara_to_defender/crowdstrike`, `list_siem_targets` | A | Cybertron |
| `tools/defense/{splunk,sentinel,elastic,edr}.py` (186/216/178/222) | SIEM/EDR push 백엔드 | A | Cybertron |
| `tools/defense/conops.py` (113) | ConOps의 SIEM 타깃 선언 조회 | A | Cybertron |
| `tools/defense/brief.py` (262) | Defense Brief 생성 | A | Cybertron |
| `tools/defense/__init__.py` (39) | `DEFENSE_TOOLS` export | A | Cybertron |
| `mcp_server/blue.py` (55) | `BlueClient` — receiver/monitor HTTP 래퍼 | **B** | **→ AutoBot** |
| `mcp_server/tools_blue.py` (105) | `decepticon_blue_*` MCP 툴 8종 (status/sources/events/incidents/notifications/body/search/timeline) | **B** | **→ AutoBot** |
| `agents/prompts/` 내 `blue_cell` 롤 프롬프트 | Blue 시스템 프롬프트 | **B** | **→ AutoBot** |

### 1.2 센서 인프라 — `examples/blue-local-sensor/` (전부 System B → AutoBot)

| 파일 (라인) | 역할 |
|---|---|
| `blue_receiver.py` (783) | **수집 코어** — Fluent Bit `/ingest` 수신, `normalize()` 정규화, SQLite 저장, `/events /search /timeline /sources /metrics /bodies /stream(SSE)` 질의 API |
| `blue_monitor.py` (972) | **상시 모니터** — receiver `/events` 폴링, 내장 `RULES` 매칭→인시던트, **AI watch 윈도우**(LLM 분석), 커버리지/아웃테이지 감시, `/incidents /notifications /metrics` |
| `fluent-bit.yaml` (54) | **= 현재 커버리지 설정**. tail 입력 2개(proxy access, target logs) → receiver HTTP out |
| `bodytap/bodytap.go` (163) | Caddy용 요청 body 스풀 탭(Go) |
| `Caddyfile`, `Dockerfile.caddy` | 인그레스 프록시(접근 로그+body) |
| `capture_process.py` (74) | 프로세스 stdout/stderr 래퍼 → 생명주기 레코드 |
| `target.py` (80) | 테스트용 타깃 웹서비스 |
| `compose.yaml` / `compose.runtime.yaml` / `compose.logs.yaml` | 센서 스택 토폴로지 |
| `Dockerfile.receiver` | receiver 이미지 |
| `smoke_test.py` / `watch_smoke_test.py` | 통합 스모크 |
| `README.md` | 셋업/API/보존/한계 |

### 1.3 TS 클라이언트 — `clients/`

| 파일 | 역할 | 조치 |
|---|---|---|
| `cli/src/commands/blue.ts` | `/blue up\|status\|incidents\|events\|verify\|sources\|analyze` | §3.6 capability 게이팅 |
| `cli/src/commands/mode.ts` | `/mode blue` → assistant `blue_cell` | 게이팅 |
| `cli/src/hooks/useBlueNotifications.ts` | `[Blue Cell]` 알림 피드 | 게이팅 |
| `cli/src/commands/{registry,help}.ts` | 커맨드 등록/도움말 | 게이팅 |
| `web/src/app/api/blue/status/route.ts`, `engagements/[id]/layout.tsx` | Web Blue 컨트롤 | 게이팅 |

### 1.4 Core 계약 — `packages/decepticon-core/` (이동 없음)

- `types/engagement.py`: Finding의 `detected_by_blue`, `detection_notes` — Red/Blue
  공유 계약, **core 유지**.
- `types/kg.py`: `DetectionFired` 등 — System A가 씀. core 유지(Cybertron도 소비).
- `plugin_loader.py`: 확장 계약. AutoBot이 의존.

### 1.5 테스트 — `packages/decepticon/tests/unit/`

`blue_cell/`(test_tap, test_rule_match*, test_scan, test_brief, test_resident_watch,
test_sensor_normalization, test_sensor_tools), `agents/test_blue_cell_agent.py`,
`mcp_server/test_blue_tools.py`. → System 분류 따라 AutoBot/Cybertron으로 동반 이동.

---

## 2. System B 데이터 흐름 (AutoBot의 뼈대)

```text
[사용자 환경 로그 소스]
  ├─ Caddy 인그레스(접근 로그 + bodytap 요청 body)
  └─ 타깃 로그 파일 / capture_process 래퍼
        │  (Fluent Bit tail, source별 cursor/offset/counter)
        ▼
  blue_receiver  /ingest (JSONL POST)
        │  normalize() → 정규화 envelope(schema_version, signal_type,
        │               event_type, source, provenance, raw_record, attributes,
        │               request_id/trace_id/span_id/severity 상위복사)
        ▼  SQLite(events: seq PK, event_id UNIQUE, json_extract 인덱스)
  질의 API: /events(after커서) /search(field=request_id|trace_id|source)
            /timeline(≤1h window) /sources /metrics(+collector) /bodies/<ref> /stream(SSE)
        ▲                              │
        │ 폴링(/events after cursor)   │ 읽기(HTTP)
  blue_monitor                         │
    - RULES 매칭 → incidents           │
    - AI watch 윈도우(LLM verdict)     │
    - 커버리지/아웃테이지 알림         │
    질의: /incidents /notifications /metrics
        ▲
        │ 5 sensor tools / 8 MCP tools (read-only, HTTP)
  Blue Cell agent (read-only, bash 없음)  →  CLI/Web 알림 피드
```

정규화 envelope·`/ingest`·`/sources`·collector 메트릭은 **이미 다중 소스를
염두에 두고** 설계됨(telemetry-design.md가 OTLP/syslog/Docker/host/cloud
adapter 로드맵 명시). 즉 **SIEM급·플러그인 커버리지의 토대가 이미 있다.**

---

## 3. "커버리지 플러그인 + 에이전트 전수 열람"을 막는 하드코딩 (수정 지점)

사용자 의도를 실현하려면 아래 choke point를 **소스 비종속(source-agnostic)**으로
풀어야 한다. 전부 현존 코드에서 확인된 지점이다.

### 3.1 `normalize()`가 소스 2종을 if/else로 하드코딩 🔴 최대 장애물
`blue_receiver.py:146-266` — `sensor_file`이 `PROXY_LOG_PREFIX`로 시작하면
`blue-ingress-proxy`, 아니면 `target-log-file`. 새 소스(Windows Event/Sysmon,
syslog, cloudtrail, k8s audit, EDR …)를 추가할 방법이 없음.
→ **source adapter 레지스트리**로 전환: `signal_type`/태그별 normalizer를
플러그인이 등록. 미등록 소스는 `raw_record`+`attributes`로 보존(passthrough).

### 3.2 source enum이 4곳에 하드코딩 🔴
- `blue_receiver.py` `/timeline`(615), `metrics()`(438-445) — `("blue-ingress-proxy","target-log-file")`
- `tools/defense/blue_sensor.py` `blue_sensor_timeline`(204)
- `mcp_server/tools_blue.py` `decepticon_blue_timeline`(324)
→ 에이전트가 **"모든 이벤트 열람"** 하려면 이 enum을 제거하고 `/sources`가
반환하는 실제 소스 집합으로 구동. timeline `source` 필터는 자유 문자열 허용.

### 3.3 Fluent Bit 입력이 고정 2개 🔴
`fluent-bit.yaml` — tail 2개만. 커버리지 추가 = 입력 추가.
→ **드롭인 커버리지 조각**(`conf.d/*.yaml` include 또는 adapter별 Fluent Bit
fragment)으로. 또는 adapter가 자체 수집기로 `/ingest`에 직접 POST(계약만 지키면
Fluent Bit 불요) — telemetry-design.md 3단계와 일치.

### 3.4 모니터 RULES가 코드 상수 🟡
`blue_monitor.py:38` `RULES = (...)` 튜플. `blue_cell/rule_match.py`의
`load_rules()`(JSONL/디렉터리)는 이미 파일 로딩을 지원하나 모니터는 미사용.
→ 룰을 **룰팩 디렉터리**에서 로드(커버리지 adapter가 자기 룰팩 동봉).

### 3.5 search 필드 고정 🟡
`blue_receiver.py:27` `SEARCH_FIELDS`(request_id/trace_id/source).
→ 공통 상관 필드 + adapter가 선언하는 인덱스 필드로 확장.

### 3.6 패키징 — 센서가 `examples/` 스크립트 🔴
receiver/monitor가 설치 가능한 모듈이 아니라 예제 스크립트.
→ `autobot.sensor`(receiver/monitor)로 패키지화, 엔트리포인트 스크립트 제공.

### 3.7 에이전트 툴 번들이 5개로 고정 🟡
`agents/standard/blue_cell.py:20` `_STANDARD_TOOLS`. plugin tool 미상속
(telemetry-design.md:50 "shipped graph does not inherit additive plugin tools").
→ AutoBot에선 커버리지 adapter가 **소스별 조회 툴**을 기여할 수 있게(opt-in).

### 3.8 결합점(Decepticon이 Blue를 끌어쓰는 곳) — 분리 시 끊기
`graph_registry.py`(STANDARD_GRAPHS에 blue_cell), `langgraph.json`,
`agents/__init__.py`, `agents/build.py:447`, `tools/__init__.py:13`
(DEFENSE_TOOLS 하드 import), `mcp_server/server.py`(register_blue_tools 무조건).
→ 플러그인 발견(entry-point)으로 전환, 없으면 degrade.

---

## 4. AutoBot 커버리지 플러그인 인터페이스 (설계 방향)

telemetry-design.md의 adapter 요건("stable source ID, cursor, heartbeat,
drop counter, raw 보존, 동일 envelope 매핑")을 플러그인 계약으로 공식화:

```text
CoverageAdapter (entry-point group: "autobot.coverage")
  - source_id: str                      # 안정적 소스 식별자
  - signal_type: str                    # http | log | process | audit | cloud | edr ...
  - collection:                         # 둘 중 하나
      (a) fluentbit_fragment() -> yaml  # Fluent Bit 입력 조각, 또는
      (b) run(ingest_url)               # 자체 수집기 → /ingest 직접 POST
  - normalize(raw) -> Event             # 원본→정규화 envelope (raw_record 보존 필수)
  - search_fields: list[str]            # 이 소스가 제공하는 인덱스 필드(선택)
  - rulepack_dir: Path | None           # 이 소스용 탐지 룰(선택)
  - health() -> {cursor, heartbeat, dropped}  # 커버리지 증빙
```

- 번들 기본 adapter 2종(http-ingress-proxy, target-log-file)을 이 계약으로
  재작성 → 기존 동작 보존 + 신규 소스 동형 추가.
- 사용자 환경별 커버리지(예: `autobot-coverage-windows`,
  `-syslog`, `-cloudtrail`)를 **별도 pip 패키지**로 배포 → 설치만으로 발견.
- 에이전트 read 계약을 source-agnostic화(§3.2) → **에이전트가 모든 소스의
  모든 이벤트를 열람**(요구사항 충족). "로그 없음 ≠ 공격 없음"
  (coverage-gap) 원칙은 telemetry-design.md 그대로 유지.

---

## 4b. 대응(Response) 레이어 — AutoBot 최종 목표 "탐지 → 조사 → 대응"

**AutoBot 최종 목표 = 탐지 → 조사 → 대응**의 완전한 방어 루프.
현 Blue Cell은 **탐지**(monitor 룰·AI watch, §2)와 **조사**(read-only 에이전트·
센서 툴·body/timeline/search)까지는 이미 수행하나, **대응은 의도적으로 없다**
(telemetry-design.md: observe-and-report를 response와 분리).

- **단기 목표:** 탐지·조사를 갖춘 System B를 AutoBot으로 분리 + 커버리지 플러그인.
- **최종 목표:** 아래 **대응 레이어**를 추가해 루프를 닫는다 (이 절).

응답 액션은 등급제로 설계한다.

**응답 액션 분류 (단계적 권한):**

| 등급 | 액션 | 가역성 | 가드레일 |
|---|---|---|---|
| R0 조사·통보 | 케이스 오픈, 알림, 증거 수집 | 가역 | 현 read-only + 기록 |
| R1 탐지 배포 | Sigma→Splunk/Sentinel/Elastic, YARA→Defender/CrowdStrike (`tools/defense` 연결기) | 준가역(룰 비활성화 가능) | 스코프 선언 + 승인 |
| R2 봉쇄 | 인그레스(Caddy) IP/경로 차단, 세션 차단 | 준가역 | 승인 + 만료(TTL) |
| R3 능동 대응 | 호스트 격리, 프로세스 종료, 계정 비활성 | 비가역 가능 | 명시 승인 + dry-run 필수 |

**설계 원칙:**
- **기본 안전**: 에이전트 기본 그래프는 R0만. R1~R3는 **opt-in** + 환경별
  권한·크리덴셜이 선언됐을 때만 노출(현 `conops.blue_team.<target>` 선언
  패턴을 응답 권한 선언으로 일반화).
- **가드레일**: 비가역/outward 액션은 **승인 게이트 + dry-run + 스코프 한정 +
  감사 로그**. (전역 지침의 "되돌리기 어려운 작업은 사전 확인"과 일치)
- **응답 플러그인**: 커버리지 adapter와 대칭으로 **response adapter**
  (entry-point `autobot.response`) — 각 adapter가 지원 등급·타깃·dry-run·
  롤백을 선언. SIEM/EDR 연결기는 이 계약으로 재작성해 AutoBot에 수용.
- **탐지→대응 바인딩**: 인시던트(§2 monitor)에 **권고 응답**을 첨부하고,
  승인 시 response adapter 실행 → 결과를 케이스에 기록(닫힌 루프).

**구현 순서:**
- **단기**: 탐지·조사(이미 존재) 분리 + 커버리지 플러그인·전수 열람 토대.
- **최종**: 대응 레이어로 루프 완성 — 탐지 → 조사 → 인시던트 → (승인) →
  R1/R2 응답 1종 → 케이스 기록(E2E). R3는 가드레일 성숙 후.

---

## 5. AutoBot 분리 범위 확정 (이 분석의 결론)

**이번 AutoBot으로 (System B + 대응 레이어):**
- `agents/standard/blue_cell.py`, blue 프롬프트
- `tools/defense/blue_sensor.py` (5 센서 툴)
- `mcp_server/blue.py`, `tools_blue.py` (8 MCP 툴)
- `examples/blue-local-sensor/` 전부 → `autobot.sensor` 패키지화
- **응답 연결기** `tools/defense/{splunk,sentinel,elastic,edr}.py` +
  `conops.py`(타깃/권한 선언) → AutoBot **response adapter**로 재작성 (§4b R1)
- 관련 테스트
- §3 하드코딩을 커버리지 플러그인 계약으로, 응답을 response adapter 계약으로 전환

**Decepticon 잔류 → 추후 Cybertron (System A orchestration):**
- `blue_cell/tap.py`(Red 샌드박스 로그 소비), `tools/defense/blue_cell.py`
  (`blue_cell_scan` → KG `DetectionFired`·MTTD·gap), `tools/defense/tools.py`
  (vaccine가 룰을 생성→push 오케스트레이션), `tools/defense/brief.py`(Defense Brief),
  vaccine 루프
- `decepticon-core`의 detection-gap·KG 계약은 core 유지(셋 다 소비)

> **경계 주의:** `tools/defense/tools.py`의 push 툴은 **연결기(AutoBot)**와
> **vaccine 오케스트레이션(Cybertron)**이 한 파일에 섞여 있다. 분리 시
> 연결 실행부(splunk/sentinel/elastic/edr 클라이언트)는 AutoBot response
> adapter로, "Detector 산출 룰을 받아 push 결정"하는 상위 로직은 Cybertron으로
> 가른다.

**공유(core 또는 양쪽 참조):** `rule_match.py` 룰 엔진, `sample_rules.jsonl`,
detection-gap 계약.

→ 열린 질문(intent.md): 룰 엔진(`rule_match.py`)을 **core로 승격**해 AutoBot·
Cybertron이 공유할지, 아니면 AutoBot에 복제할지. §3.4/3.5가 AutoBot에서
먼저 쓰므로 **core 승격 추천**.

---

## 6. 다음 단계

1. intent.md에 AutoBot 의도(SIEM급·커버리지 플러그인·전수 열람)와 System A/B
   분리선을 확정 반영. ✅(동반 커밋 예정)
2. 이 분석을 근거로 `2026-10-23-autobot-blue-extraction.md`(구현 설계)를
   재작성: §4 커버리지 플러그인 계약 + §3 하드코딩 제거 + Phase 계획.
3. Phase 1(모노레포 내 플러그인화)부터: System B를 끌 수 있는 플러그인으로.
