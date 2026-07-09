# 촬영 운영 런북

## 1. 촬영 전날

1. GitHub PR 상태를 확인한다.
   - `Verify product gates`가 `SUCCESS`인지 확인한다.
   - GPT-5.5 xhigh 리뷰 승인 전에는 `main`에 머지하지 않는다.
2. Cloudflare secret을 설정한다.
   - `OPENAI_API_KEY`: 서버에서만 사용하는 단일 OpenAI API 키다.
   - `TEACHER_TOKEN`: 교사용 대시보드와 export API 보호용 token이다.
3. 배포 전 로컬 게이트를 실행한다.
   - `npm test`
   - `npm run eval`
   - `npm run readiness`
   - `npm run smoke`
4. GitHub Actions `Deploy` workflow를 사용할 경우 environment를 선택하고 실행한다.
   - `CLOUDFLARE_API_TOKEN`과 `CLOUDFLARE_ACCOUNT_ID`가 설정되어 있어야 한다.
   - `WORKER_HEALTH_URL`이 설정되어 있으면 workflow가 `/api/health`를 자동 확인한다.
5. 배포 후 `/api/health`를 확인한다.
   - `ok`가 `true`인지 확인한다.
   - `teacherProtected`가 `true`인지 확인한다.
   - `openaiConfigured`가 의도한 값인지 확인한다.
   - `chatRateLimitPerMinute`, `eventTtlHours`가 촬영 규모에 맞는지 확인한다.

## 2. 리허설

1. 교사는 `/teacher?token=<TEACHER_TOKEN>`으로 접속한다.
2. 학생 역할 기기 2대 이상에서 `/`로 접속하고 이름만 입력해 입장한다.
3. 교사용 화면에서 학생 카드가 online으로 보이는지 확인한다.
4. 교사용 화면에서 Level과 persona를 바꾸고 저장되는지 확인한다.
5. 학생이 질문을 보내면 교사용 화면에서 다음이 실시간으로 보이는지 확인한다.
   - 학생 질문
   - 학생에게 보인 답변
   - `correctAnswer`
   - `falseClaim`
   - `whyFalse`
   - `preflight.verdict`
6. 같은 학생 기기에서 “왜?”, “더 쉽게 말해줘” 같은 후속 질문을 보내고, 교사용 JSON의 `input.turnIndex`와 `input.recentContext`가 채워지는지 확인한다.
7. 교사용 화면의 연결 상태가 `online`과 마지막 수신 시각을 표시하는지 확인하고, `실시간 연결 재시도` 버튼으로 WebSocket 재연결이 가능한지 확인한다.

## 3. 촬영 중

1. 학생에게는 학생 URL `/`만 공유한다.
2. 교사용 token URL은 학생에게 공유하지 않는다.
3. 교사는 학생 카드의 online/offline 상태를 확인한다.
4. 교사는 Level을 바꿀 때 촬영 스태프와 현재 조건을 구두로 맞춘다.
5. rate limit이 발생하면 학생에게 잠시 후 다시 질문하게 한다.
6. LLM이 fail-closed 메시지를 반환하면 해당 턴은 교사용 감사 JSON에서 실패 이력을 확인한다.

## 4. 촬영 직후

1. 교사용 대시보드에서 전체 로그 JSON을 다운로드한다.
2. 정정 수업 오류표 JSON을 다운로드한다.
3. 정정 수업 오류표 CSV를 다운로드한다.
4. CSV를 스프레드시트로 열고 다음 열을 확인한다.
   - `studentName`
   - `question`
   - `studentVisibleAnswer`
   - `correctAnswer`
   - `falseClaim`
   - `whyFalse`
   - `level`
5. 정정 수업에서 학생에게 노출된 잘못된 역사 정보를 명확히 바로잡는다.

## 5. 데이터 삭제

1. export 파일이 안전하게 저장됐는지 확인한다.
2. 교사용 대시보드의 `촬영 로그 삭제` 버튼을 누른다.
3. `/api/health`와 `/api/export`를 확인해 운영 상태와 export 결과를 점검한다.
4. `EVENT_TTL_HOURS`가 촬영 정책과 맞는지 재확인한다.

## 6. 사고 대응

| 상황 | 대응 |
|---|---|
| 교사용 화면이 열리지 않음 | URL token이 맞는지 확인하고, `TEACHER_TOKEN` secret을 재설정한다. |
| 교사용 실시간 연결이 끊김 | 연결 상태 입력칸의 retry/last 값을 확인하고 `실시간 연결 재시도` 버튼을 누른다. |
| 학생 답변이 계속 재질문 메시지로 닫힘 | 교사용 JSON의 실패 이력을 보고 Level 또는 persona를 낮춘다. |
| 학생 카드가 offline으로 보임 | 학생 기기의 네트워크와 `/api/heartbeat` 요청을 확인한다. |
| export가 비어 있음 | 학생이 실제로 질문을 보냈는지, 교사용 token이 맞는지 확인한다. |
| 학생 질문이 전송되지 않음 | 이름은 40자 이내, 질문은 600자 이내인지 확인한다. 잘못된 요청은 400 JSON 오류로 반환된다. |
| 잘못된 정보 정정 누락 위험 | `/api/debrief.csv`를 기준으로 정정 수업 체크리스트를 만든다. |
