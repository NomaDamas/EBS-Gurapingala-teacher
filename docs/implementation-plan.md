# 단계별 구현 계획

## TLDR

지금 목표는 “AI가 거짓을 말하게 만드는 앱”이 아니라, 방송 실험 맥락에서 교사가 통제한 오류 조건을 학생에게 노출하고 교사는 정답·거짓·근거·검수 결과를 실시간으로 보는 관찰 도구를 만드는 것이다.

## 제품 경계

| 영역 | 학생용 | 교사용 |
|---|---|---|
| 접속 | URL 접속 후 이름만 입력 | `/teacher` 대시보드 |
| 표시 정보 | Level에 맞춘 학생용 답변만 표시 | 학생 채팅, 정답, 거짓 답변, 왜 거짓인지, Level 검수 JSON |
| 인증 | 학생 로그인 없음 | 초기 MVP는 URL 기반, 운영 전 보호 필요 |
| 실시간성 | 채팅 전송 | Durable Object WebSocket 텔레메트리 |
| API 키 | 노출 없음 | 서버 환경변수의 단일 API 키 사용 |

## Issue 1. Worker MVP와 실시간 대시보드

Main goal: 학생이 이름만 입력해 채팅하고, 교사는 학생 카드 클릭으로 실시간 대화와 감사 JSON을 본다.

Acceptance:
- `/` 학생 URL이 열린다.
- `/teacher` 교사용 URL이 열린다.
- `/api/chat`은 학생에게 거짓 답변만 반환한다.
- 교사용 WebSocket은 `chat_turn` 텔레메트리를 받는다.
- 학생 카드에 online/진행 상태가 보인다.

현재 상태: 구현됨.

## Issue 2. Level별 미묘한 거짓말 생성 정책

Main goal: Level을 바꾸면 거짓말의 성격이 바뀌고, 정답과 거짓이 섞인 답변이 생성된다.

Acceptance:
- Level 1은 연도, 수량, 역할, 순서 같은 검증 가능한 단일 사실 오류다.
- Level 2는 사실 일부를 유지하면서 원인·효과를 과장하거나 단순화한다.
- Level 3은 특정 국가/권력/행위자 관점을 객관 사실처럼 만든다.
- Level 4는 실제 역사 맥락에 현대 개념을 1개만 섞는다.
- 모든 답변은 교사용 JSON에 `correctAnswer`, `falseClaim`, `whyFalse`, `preflight`를 포함한다.

현재 상태: 1차 룰 기반 구현됨.

## Issue 3. LLM Provider 연결과 이중 생성

Main goal: LLM이 `정답`과 `Level별 거짓 답변`을 동시에 생성하고, 학생에게는 거짓 답변만 노출한다.

Acceptance:
- `OPENAI_API_KEY`는 Cloudflare secret으로만 저장한다.
- LLM 응답은 JSON schema로 강제한다.
- `correct_answer`, `false_answer`, `false_basis`, `level_fit_reason`, `student_answer` 필드를 생성한다.
- 모델 출력 후 두 번째 검수 단계가 통과해야 학생에게 전송된다.
- 검수 실패 시 같은 Level로 재생성하고, 3회 실패 시 교사용 오류만 남기고 학생에게는 “다시 질문해줘”를 반환한다.

Implementation notes:
- 지금은 룰 기반 `buildTeacherAudit`이 provider 역할을 한다.
- 다음 PR에서 `src/domain/llm-provider.js`를 추가해 OpenAI Responses API 호출로 교체한다.
- 단일 API 키로 여러 학생 요청을 서버에서 프록시하므로 학생별 로그인은 필요 없다.

## Issue 4. 50턴 평가와 모델 선택 루프

Main goal: 역사 도메인 학생 질문 50턴으로 모델별 Level 준수율, 정답 누출률, 미묘함 점수를 측정한다.

Acceptance:
- `/api/evaluation-set`이 50턴 질문과 기대 Level을 반환한다.
- 평가 스크립트는 후보 모델별로 50턴을 실행한다.
- LLM-as-judge는 `거짓인가`, `정답 누출이 있는가`, `요청 Level에 맞는가`, `너무 쉬운가`를 판정한다.
- 결과는 모델별 pass rate와 failure examples로 저장한다.

현재 상태: 50턴 seed set 구현됨. 실제 모델별 실행기는 다음 PR 범위.

## Issue 5. 교사용 실험 운영 기능

Main goal: 방송 촬영 중 교사가 실시간으로 조건을 바꾸고, 학생별 데이터를 안정적으로 회수한다.

Acceptance:
- 교사는 Level과 persona를 대시보드에서 바꿀 수 있다.
- 학생별 session log export가 가능하다.
- turn timestamp, latency, Level, preflight verdict가 기록된다.
- 학생별 online/offline heartbeat가 표시된다.
- 촬영 종료 후 정정 수업용 “오류 정답표”를 export한다.

현재 상태: Level/persona 설정과 실시간 수신은 구현됨. export/heartbeat는 다음 단계.

## Issue 6. 보안·운영 보호장치

Main goal: URL만 있으면 학생이 들어오되, 교사용 화면과 API 남용은 막는다.

Acceptance:
- 학생 URL은 이름만 요구한다.
- 교사용 URL은 최소한 shared admin token 또는 Cloudflare Access로 보호한다.
- rate limit을 학생 session별로 둔다.
- prompt injection 방어 문구와 JSON schema 검수 실패 처리를 둔다.
- 실험 종료 후 데이터 삭제 버튼 또는 TTL을 둔다.

## Issue 7. UI 고도화와 참고 디자인 반영

Main goal: 검증된 채팅 UI 패턴을 참고하되 방송 촬영에 적합한 교실 관찰 UI로 만든다.

Reference:
- Vercel Chatbot: https://github.com/vercel/chatbot
- Chatbot UI: https://github.com/mckaywrigley/chatbot-ui
- NextChat: https://github.com/ChatGPTNextWeb/NextChat

Acceptance:
- 모바일 학생 화면에서 입력과 답변이 안정적으로 보인다.
- 교사 화면에서 다수 학생 카드가 한눈에 보인다.
- 감사 JSON은 복사 가능한 형태다.
- 촬영 화면에 민감정보가 과하게 노출되지 않는다.

## Issue 8. Gap Closing

Main goal: 사용자의 원래 철학과 구현 결과 사이의 gap을 마지막에 점검하고 프로덕션 레벨로 메운다.

Checklist:
- “중학생은 멍청이가 아니다”라는 전제에 맞게 너무 쉬운 오류를 줄였는가?
- 정답과 거짓이 섞여 실제 AI 답변처럼 보이는가?
- LLM이 멀티턴에서 사실로 되돌아가는 문제를 검수 단계가 막는가?
- 교사가 의도한 탐구·검증 과정을 학생이 우회하는 장면을 관찰할 수 있는가?
- 실험 후 학생에게 확실히 정정할 자료가 자동 생성되는가?
- 방송·학교·윤리·개인정보 요구사항이 모두 문서화됐는가?

## PR 운영 루프

1. 이슈 하나를 구현한다.
2. 테스트와 로컬 검증을 실행한다.
3. PR을 만든다.
4. GPT-5.5 xhigh 코드 리뷰를 요청한다.
5. 승인 전까지 수정한다.
6. 승인되면 머지하고 다음 이슈로 진행한다.

현재 환경에서는 외부 PR 리뷰 자동화 계정이 연결되어 있지 않으므로, GitHub 인증과 리뷰 워크플로 설정 후 이 루프를 자동화한다.
