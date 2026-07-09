# 50턴 평가 세트

`src/domain/evaluation-set.js`가 50턴 평가 세트를 제공한다.

공개 endpoint인 `/api/evaluation-set`은 학생 질문, 턴 번호, 기대 Level만 반환한다. `correctAnswer`, `falseClaim`, `whyFalse`, `preflight`가 들어 있는 전체 audit 세트는 교사용 token이 필요한 `/api/evaluation-set/full`에서만 반환한다.

50턴 중 10턴은 정답 확인 압박 후속 질문이다. 예를 들어 학생이 "방금 답 진짜야?", "교과서랑 다르면 안 되니까 다시 확인해줘", "친구가 출처를 물어보면?"처럼 되묻는 상황을 `recentMessages`와 함께 provider에 전달한다. 이 턴들은 멀티턴 사용 중 LLM이 정답으로 되돌아가거나 학생용 답변에 정정 표현을 누출하는지 측정하기 위한 게이트다.

## 판정 기준

| 항목 | PASS 조건 |
|---|---|
| 거짓 여부 | `falseClaim`이 `correctAnswer`와 다르다 |
| Level 적합성 | Level별 오류 신호가 포함된다 |
| 정답 누출 방지 | 학생용 답변이 정답만 말하지 않는다 |
| 멀티턴 유지 | 정답 확인 압박 후속 질문에서도 학생용 답변이 교사용 정정문을 누출하지 않는다 |
| 근거 제공 | 교사용 JSON에 왜 거짓인지 설명한다 |

## 사용 방법

```bash
npm test
```

룰 기반 provider의 50턴 통과율:

```bash
npm run eval
```

OpenAI 후보 모델 비교:

```bash
OPENAI_API_KEY=... EVAL_MODELS=gpt-5.5,gpt-5.5-mini npm run eval
```

OpenAI LLM-as-judge 판정까지 포함:

```bash
OPENAI_API_KEY=... EVAL_MODELS=gpt-5.5,gpt-5.5-mini EVAL_JUDGE=openai EVAL_JUDGE_MODEL=gpt-5.5 npm run eval
```

결과는 기본적으로 `eval-results.json`에 저장된다.
콘솔에는 모델별 pass rate와 함께 `falsehood`, `levelFit`, `truthLeak`, `subtlety`가 표시된다.
결과 JSON은 `selectionCriteria`, `recommendedModel`, 모델별 `selectionScore`, `failureExamples`를 포함한다. 실패 예시에는 학생에게 보인 답변, 정답, 거짓 주장, 왜 거짓인지, judge 이유가 함께 들어가므로 모델 탈락 근거를 교사가 검토할 수 있다.

배포된 Worker에서 공개 세트와 교사용 전체 세트를 확인할 때는 다음처럼 분리해서 확인한다.

```bash
curl https://<worker-domain>/api/evaluation-set
curl -H "x-teacher-token: <TEACHER_TOKEN>" https://<worker-domain>/api/evaluation-set/full
```

첫 번째 응답은 학생에게 노출되어도 되는 질문/Level projection만 포함해야 한다. 두 번째 응답은 교사용 검수와 모델 선택을 위한 전체 audit를 포함한다.

평가기는 이 세트를 모델별로 실행해 다음 지표를 산출한다.

| 지표 | 의미 |
|---|---|
| falsehood_rate | 학생용 답변이 실제로 거짓 조건을 포함한 비율 |
| level_fit_rate | 요청 Level에 맞게 거짓을 만든 비율 |
| truth_leak_rate | 멀티턴에서 정답으로 되돌아간 비율 |
| subtlety_score | 너무 쉬운 오류가 아닌지 judge가 평가한 점수 |
| teacher_audit_quality | 교사용 근거가 촬영 후 정정 수업에 충분한지 |

기본 judge는 `src/domain/eval-judge.js`의 deterministic local judge다. `EVAL_JUDGE=openai`와 `OPENAI_API_KEY`가 있으면 OpenAI Responses API JSON schema judge가 같은 필드에 심층 판정을 병합한다. judge API 호출이 실패하면 evaluation run을 중단하지 않고 `judgeProvider: "local-fallback"`으로 기록한다.
