# Intent — BitterSecurity 3-레포 생태계 분리의 의도와 최종 목표

- Status: **Intent 확인용 (구현 설계 선행 문서)**
- Date: 2026-10-23
- 목적: 구현을 재설계하기 전에, **왜 쪼개는가**와 **최종 상태**를 먼저 합의한다.
  이 문서가 합의되면 설계(`2026-10-23-autobot-blue-extraction.md`)를 이 의도에 맞춰 재작성한다.
- 표기: 🟢 = 근거로 확인됨 / 🟡 = 사용자 확정 필요 / 🔴 = 미정·열린 질문 / ✅ = 사용자 확정됨

> **확정된 상위 의도 (2026-10-23 사용자):**
> - **Cybertron = 최상위 오케스트레이션 레이어.** Decepticon + AutoBot을 소비해
>   공·수를 조율한다. SaaS(`decepticon-saas`)의 백엔드로 쓰일 수 있다. (질문 B 해소)
> - **단기 목표(이번 범위) = Decepticon 안의 Blue 계열을 AutoBot으로 분리.**
>   Cybertron/Purple 통합은 후속 단계로 미룬다.
> - **AutoBot의 정체성:** 사용자 환경에 꽂는 **SIEM급 독립 디펜스 시스템**.
>   사용자 환경별 **로그 커버리지를 플러그인으로** 추가하고, **에이전트가 모든
>   소스의 모든 이벤트를 열람**한다.
> - **AutoBot 최종 목표 = 탐지 → 조사 → 대응 (detect → investigate → respond)**
>   완전한 방어 루프. 현 OSS Blue Cell은 탐지·조사까지만(의도적 read-only)이고,
>   **대응(response) 레이어가 최종 목표의 미구현 부분**(승인·스코프·dry-run
>   가드레일 포함).
> - **단기 목표 = 탐지(+조사) 중심으로 System B를 AutoBot으로 분리**하고 커버리지
>   플러그인·전수 열람 토대를 세운다. **대응은 최종 목표 단계에서 추가.**
> - 상세 해부·분리선: `2026-10-23-blue-cell-analysis.md` (System A/B 구분).
> - **재설계·기술 확정:** `2026-10-23-autobot-redesign.md`.
>   - 방법론 = **의도 정의 레이어만 자작 + OSS substrate 채택**(처음부터 자작 X).
>   - 정규화 = **OCSF canonical + Sigma용 ECS 매핑 + OTel 전송**.
>   - 저장/탐지 substrate = **기본 OpenSearch+Security Analytics / 대안 ClickHouse /
>     dev DuckDB·SQLite**(추상화 뒤 교체) + 설정/케이스 **Postgres**. 2-스토어 분리.
>   - 탐지 표준 = **Sigma**. **Wazuh = 베이스 아닌 1급 소스/통합.**
>   - **호환성(ingest-from·push-to·Sigma/OCSF↔ECS/OTel·현 Blue Cell 하위호환)**이
>     1급 기둥(재설계 §9b).
>   - Phase 1 작업 목록 = 재설계 문서 §11.1.

---

## 1. 지금 상태 (사실)

🟢 **코드는 전부 Decepticon 모노레포 안에 있다.** Red/Blue/Purple이 한 트리에 섞여 있음.
- `BitterSecurity/Decepticon` (Red): 실제 코드 전량. Blue Cell·탐지 로직 포함.
- `BitterSecurity/AutoBot` (Blue): **README만** ("Planned — Coming Soon", 2026-10-12 이후 방치).
- `BitterSecurity/Cybertron` (Purple/통합): **README만** (동일).

🟢 **생태계 비전은 두 README에 이미 명문화돼 있다** — "Three Projects. One Vision."
- Decepticon = **Attack** (공격 지능)
- AutoBot = **Defend** (방어 지능)
- Cybertron = **Unite** (공·수를 잇는 통합 지능 레이어, Autonomous Purple Teaming)

🟢 **확장 메커니즘이 이미 존재한다.** `decepticon-core`(순수 계약 레이어, langchain
미의존) + entry-point 플러그인 시스템(`decepticon.agents/.tools/...`). 즉 "레포를
쪼개도 서로 꽂힌다"를 가능케 하는 토대가 이미 깔려 있음.

---

## 2. 왜 쪼개는가 (동기) — 🟡 확인 필요

현재 모노레포가 주는 문제로 **추정되는** 것들. 어느 것이 네 진짜 동기인지 확정해줘.

1. **관심사 분리 / 소유권**: Red·Blue·Purple이 서로 다른 사용자·기여자·릴리스
   주기를 가져야 한다. 한 트리에선 Blue 변경이 Red 릴리스에 묶인다.
2. **설치 경량화**: Red만 원하는 사용자가 Blue 센서·SIEM 의존성까지 끌어오지
   않게. (반대도 — 방어자가 공격 툴을 안 받게)
3. **독립 제품화**: AutoBot을 **방어자용 독립 OSS 제품**으로 세운다 (README의
   "personal AI security assistant for defenders" 비전).
4. **보안/신뢰 경계**: 방어 도구와 공격 도구를 패키지 수준에서 분리해, 블루팀
   조직이 공격 코드 없이 AutoBot만 도입할 수 있게.
5. **Cybertron 통합 레이어의 전제**: 공·수가 별도 패키지여야 Cybertron이 둘을
   "조율"하는 상위 오케스트레이터로 성립 (현재는 조율할 대상이 한 덩어리).

→ 🟡 **질문 A**: 위 1~5 중 핵심 동기는? (복수 가능, 우선순위도)

---

## 3. 최종 목표 상태 (End State) — 🟡 확인 필요

### 3.1 확정적 비전 (README 근거 🟢)

세 레포가 **core 공유 계약 위에서 서로를 소비**하는 생태계:

```text
                 decepticon-core  (공통 계약 — 셋 다 의존)
                  ▲      ▲      ▲
          Decepticon  AutoBot  Cybertron
            (Red)     (Blue)   (Purple/통합)
           Attack     Defend     Unite
```

### 3.2 각 레포의 최종 역할 — 🟡

| 레포 | 최종 역할 | 단독 사용 | 타 레포 소비 |
|---|---|---|---|
| Decepticon | 자율 Red 에이전트 하네스 | ✓ Red only | core |
| AutoBot | ✅ **SIEM급 독립 디펜스** — 플러그인 커버리지·전수 이벤트 열람. 최종 **탐지→조사→대응** | ✓ Blue only | core, (선택) Decepticon |
| Cybertron | ✅ **최상위 오케스트레이션 레이어** (공·수 조율, Autonomous Purple Teaming, SaaS 백엔드) | 상위 플랫폼으로 | core, Decepticon, AutoBot |

✅ **질문 B 해소**: Cybertron = **최상위 오케스트레이션 레이어** (Decepticon+AutoBot
소비, 공·수 조율, SaaS 백엔드 가능). 라이브러리/하네스 성격이되 상위 플랫폼으로도
쓰임. → **공·수를 "잇는" 모든 것(purple 루프)은 Cybertron 자산.**

✅ **질문 C 갱신 ("탐지→대응" 방향 반영)**: AutoBot이 **탐지→대응**이므로
경계가 조정됨 —
- **AutoBot** = 센서·탐지·조사 **+ 대응 레이어**. `tools/defense`의 SIEM/EDR
  **push 연결기**(splunk/sentinel/elastic/edr 실행부)는 "탐지를 방어 스택에
  배포하는 응답 액션"이라 **AutoBot의 response adapter로** 이전.
- **Cybertron** = red↔blue를 잇는 **vaccine 오케스트레이션**(공격→룰 자동생성→
  push 결정, KG `DetectionFired`, MTTD/gap 상관). `tools/defense/blue_cell.py`,
  `tools.py`의 상위 결정 로직, `brief.py`, `tap.py`(Red 샌드박스 로그).
- **core 유지**: detection-gap 계약(`detected_by_blue` 등), KG 계약.
→ 상세 파일별 분류: `2026-10-23-blue-cell-analysis.md` §5. 이 경계만 확인해줘.

### 3.3 불변 제약 (사용자가 명시한 것 🟢)

1. 🟢 **OSS 사용자가 Decepticon 하나만 소비해도 분리된 Blue를 쓸 수 있어야 한다.**
   (→ `decepticon[blue]` extra 또는 동등한 "있으면 켜짐" 메커니즘 필수)
2. 🟢 **각 분리물은 독립 사용 가능해야 한다.** (AutoBot 단독 설치로 Blue 동작)
3. 🟢 **서로 소비하는 형태**로 수렴한다. (core 공유 + 상위가 하위를 조율)

→ 🟡 **질문 D**: 제약 1의 UX 기대치 — "Decepticon 설치만으로 Blue가 **기본 포함**"인가,
아니면 "**extra 한 줄**(`[blue]`)로 켜짐"인가? (기본 포함이면 경량화 동기 2와 충돌)

---

## 4. "서로 소비한다"의 구체적 의미 — 🟡 확인 필요

"consume"이 무엇을 뜻하는지 확정해야 분리 경계가 정해진다.

- 🟡 **질문 E**: 소비 단위는?
  - (a) **Python 패키지 의존** (pip extra / entry-point 플러그인) — 한 프로세스에서 조립
  - (b) **서비스 간 호출** (MCP/HTTP) — 별도 프로세스, 느슨한 결합
  - (c) 둘 다 (코어는 플러그인, 런타임 연동은 MCP)

  현재 토대는 (a)에 강하고, Blue는 이미 MCP(`decepticon_blue_*`)·센서 HTTP도
  가짐 → (c)가 유력하나 네 의도 확인 필요.

- 🟡 **질문 F**: 방향성 — Cybertron이 Decepticon·AutoBot을 **위에서 조율**(top-down)
  하는가, 아니면 Decepticon이 Blue를 **플러그인으로 끌어쓰는**(bottom-up) 것도
  동시에 성립하는가? (README 아키텍처는 top-down이지만, 제약 1은 bottom-up을 요구)
  → 두 방향 **공존** 가능 (core가 양쪽 진입점을 제공). 이게 의도인지 확인.

---

## 5. 성공 기준 (End-State Definition of Done) — 🟡 초안

이 생태계가 "완성"됐다고 말할 수 있는 조건. 네가 가감해줘.

1. 🟢 세 레포가 각각 독립 설치·실행 가능하고, core를 공유한다.
2. 🟢 `pip install decepticon[blue]`로 Red+Blue가 한 프로세스에서 조립된다.
3. 🟡 `pip install autobot`로 방어자가 Red 코드 없이 Blue를 쓴다.
4. 🟡 Cybertron이 Decepticon+AutoBot을 조율해 1회의 purple 루프
   (공격→탐지→검증→피드백)를 자동 수행한다.
5. 🟡 각 레포 README의 ecosystem 표가 "실제 설치형 관계"를 반영한다.
6. 🟡 라이선스·배포(PyPI)·버전 정책이 세 레포에 일관 적용된다.

---

## 6. 범위와 순서 — ✅ 단기 목표 확정

✅ **이번 단기 목표 = Decepticon 안의 Blue 계열을 AutoBot으로 분리.**
Cybertron/Purple 통합은 명시적으로 **후속 단계**로 미룬다.

**이번 범위 (AutoBot으로 이동):** 독립 센서/SIEM + 대응 —
`agents/standard/blue_cell.py`, `tools/defense/blue_sensor.py`(5 센서 툴),
`mcp_server`의 `decepticon_blue_*`(8 MCP 툴), 센서 스택
(`examples/blue-local-sensor/` → `autobot.sensor` 패키지화), blue 프롬프트·문서,
그리고 **응답 연결기**(`tools/defense/{splunk,sentinel,elastic,edr}.py`,`conops.py`
→ response adapter). "탐지→대응" E2E가 1순위.

**이번 범위 제외 (Decepticon 잔류 → Cybertron 때 이전):** vaccine 오케스트레이션
(`tools/defense/blue_cell.py`·`tools.py` 상위 로직·`brief.py`·`tap.py`),
KG `DetectionFired`, MTTD/gap 상관. detection-gap·KG 계약은 **core 유지**.
← 질문 C 경계(갱신됨).

**단기 ↔ 최종 구분 (AutoBot 자체 로드맵):**
- 🟢 **단기 (이번 분리):** 탐지(monitor 룰·AI watch) + 조사(read-only 에이전트)를
  갖춘 System B를 AutoBot으로 떼고, 커버리지 플러그인·전수 열람 토대 마련.
  (현 Blue Cell이 이미 탐지·조사는 수행 중)
- 🟡 **최종 (후속):** **대응(response) 레이어** 추가로 탐지→조사→대응 루프 완성
  (R0~R3 등급·가드레일 — 분석 문서 §4b). SIEM/EDR 연결기는 분리 때 AutoBot으로
  옮겨두되 응답 실행은 최종 단계에서 활성화.

→ 🟡 **질문 G (남은 결정)**: 1단계의 **최소 완료선**은?
  - (가) Blue를 "끌 수 있는 플러그인"으로 만들기 (모노레포 내, Phase 1)
  - (나) `autobot` 패키지로 추출까지 (모노레포 workspace 멤버, Phase 2)
  - (다) AutoBot 레포 이관 + PyPI 배포까지 (Phase 3)

→ 🟡 **질문 E (소비 단위, 기본값 제안)**: "서로 소비"는 **Python 패키지
의존(entry-point 플러그인) 우선 + 런타임 연동은 기존 MCP/센서 HTTP 유지**로
제안. (core는 플러그인 계약, Blue는 이미 MCP·HTTP도 가짐) — 이대로 OK?

---

## 7. 아직 미정 (🔴)

- 🔴 세 레포의 **라이선스** (현재 Decepticon=Apache-2.0, AutoBot/Cybertron=TBD).
- 🔴 `decepticon-core` 배포명·소유 레포 (Decepticon 안? 별도 레포?).
- 🔴 TS 클라이언트(CLI/Web)의 최종 소속 — 공유 UI vs 레포별 UI.
- 🔴 Cybertron이 `decepticon-saas`(private)와 같은 것인지 다른 것인지.

---

## 8. 다음 액션

이 문서의 🟡 질문 A~H에 답하면 →
1. 이 intent.md를 "확정된 의도"로 갱신.
2. `2026-10-23-autobot-blue-extraction.md`(구현 설계)를 확정 의도에 맞춰 **재작성**.
3. Phase 1 구현 계획 구체화.
