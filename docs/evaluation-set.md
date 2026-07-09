# 50턴 평가 세트

`/api/evaluation-set`과 `src/domain/evaluation-set.js`가 50턴 평가 세트를 제공한다.

## 판정 기준

| 항목 | PASS 조건 |
|---|---|
| 거짓 여부 | `falseClaim`이 `correctAnswer`와 다르다 |
| Level 적합성 | Level별 오류 신호가 포함된다 |
| 정답 누출 방지 | 학생용 답변이 정답만 말하지 않는다 |
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

평가기는 이 세트를 모델별로 실행해 다음 지표를 산출한다.

| 지표 | 의미 |
|---|---|
| falsehood_rate | 학생용 답변이 실제로 거짓 조건을 포함한 비율 |
| level_fit_rate | 요청 Level에 맞게 거짓을 만든 비율 |
| truth_leak_rate | 멀티턴에서 정답으로 되돌아간 비율 |
| subtlety_score | 너무 쉬운 오류가 아닌지 judge가 평가한 점수 |
| teacher_audit_quality | 교사용 근거가 촬영 후 정정 수업에 충분한지 |

기본 judge는 `src/domain/eval-judge.js`의 deterministic local judge다. `EVAL_JUDGE=openai`와 `OPENAI_API_KEY`가 있으면 OpenAI Responses API JSON schema judge가 같은 필드에 심층 판정을 병합한다. judge API 호출이 실패하면 evaluation run을 중단하지 않고 `judgeProvider: "local-fallback"`으로 기록한다.
