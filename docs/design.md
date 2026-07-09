# 촬영용 채팅 UI 설계 근거

## 목적

이 제품의 UI 목표는 일반 AI 챗봇처럼 오래 머무르게 만드는 것이 아니라, 방송 촬영 중 학생의 질문 행동과 교사의 실시간 관찰을 안정적으로 드러내는 것이다. 따라서 유명 채팅 UI의 검증된 패턴은 참고하되, 그대로 복제하지 않고 교실 실험에 필요한 관찰성과 정정 가능성을 우선한다.

## 참고한 10k+ stars 채팅 UI

2026-07-10 KST에 GitHub API로 확인한 star 수 기준이다.

| 프로젝트 | Stars | 참고한 점 | 적용 방식 |
|---|---:|---|---|
| [vercel/chatbot](https://github.com/vercel/chatbot) | 20,597 | 메시지 중심 레이아웃, 입력 composer, 서버-side 모델 호출 전제 | 학생 화면은 단일 대화 흐름과 하단 입력 composer를 유지하고, API key는 서버에만 둔다. |
| [mckaywrigley/chatbot-ui](https://github.com/mckaywrigley/chatbot-ui) | 33,285 | 세션/대화 목록과 선택된 대화 패널 분리 | 교사용 화면은 학생 카드 목록과 선택 학생 대화 패널을 분리한다. |
| [ChatGPTNextWeb/NextChat](https://github.com/ChatGPTNextWeb/NextChat) | 88,425 | 빠른 접속, 모바일 대응, 간결한 채팅 경험 | 학생은 로그인 없이 이름만 입력하고 모바일에서도 입력창과 답변이 먼저 보이게 한다. |

## 학생용 UI 결정

- URL 접속 후 이름만 입력한다. 학교 제약상 학생 로그인, OAuth, 계정 생성은 두지 않는다.
- 학생 화면에는 `correctAnswer`, `whyFalse`, `preflight` 등 정정 단서가 절대 보이지 않는다.
- 답변은 말풍선 형태로 누적한다. 학생의 "복붙" 행동과 후속 질문 패턴을 관찰하기 위해 편집 도구나 출처 패널은 넣지 않는다.
- 모바일에서 composer가 한 열로 내려가고, 말풍선 폭을 넓혀 태블릿 세로 화면에서도 촬영이 가능하게 한다.
- 상단 문구는 실험 주제와 사용 가능한 외부 근거를 안내하되, AI 답변의 참거짓을 암시하지 않는다.

## 교사용 UI 결정

- 좌측 학생 카드, 중앙 대화, 우측 감사 JSON 구조를 유지한다. 이는 "여러 학생의 진행 여부"와 "선택 학생의 티키타카"를 동시에 보기 위한 구조다.
- 학생 카드에는 online/offline, 마지막 이벤트, 지연 시간, 채팅턴 수를 드러낸다.
- 감사 JSON은 복사 가능한 `pre` 영역으로 둔다. 촬영 중 빠른 확인과 촬영 후 정정 수업 자료 확인이 더 중요하기 때문이다.
- Level과 persona는 교사용 대시보드에서 조정한다. 설정 적용 ACK를 표시해 촬영 조건이 바뀐 시점을 교사가 확인할 수 있게 한다.
- token은 URL에서 제거하고 localStorage에 저장한다. 화면 녹화나 학생에게 URL이 보이는 상황에서 token 노출을 줄이기 위함이다.

## 촬영 UX 불변 조건

- 학생에게는 거짓 조건에 맞춘 답변만 보인다.
- 교사에게는 같은 턴의 정답, 거짓 주장, 왜 거짓인지, Level 적합성, 검수 결과가 보인다.
- 학생별 실시간 telemetry는 영상 녹화가 아니라 WebSocket 이벤트로 수신한다.
- 촬영방 `room`과 배포 검증용 `deploy-verify` room은 분리한다.
- UI 개선은 이 불변 조건을 약화시키면 안 된다.

## 현재 구현 매핑

| 설계 조건 | 구현 위치 |
|---|---|
| 학생 no-login 이름 입장 | `src/ui/student.js`, `/api/join` |
| 학생 대화 composer와 말풍선 | `src/ui/student.js` |
| 학생에게 거짓 답변만 노출 | `/api/chat`, `src/domain/llm-provider.js` |
| 학생 카드와 online/offline | `src/ui/teacher.js`, `src/domain/session-export.js` |
| 선택 학생 실시간 대화 | `src/ui/teacher.js`, `/ws/teacher` |
| 교사용 감사 JSON | `src/ui/teacher.js`, `teacherAudit` telemetry |
| Level/persona 설정 ACK | `src/ui/teacher.js`, `teacher_config_updated` |
| 촬영방 room 분리 | `src/worker.js`, `scripts/verify-deploy.js` |
