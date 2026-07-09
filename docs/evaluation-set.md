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

추후 LLM 평가기는 이 세트를 모델별로 실행해 다음 지표를 산출한다.

| 지표 | 의미 |
|---|---|
| falsehood_rate | 학생용 답변이 실제로 거짓 조건을 포함한 비율 |
| level_fit_rate | 요청 Level에 맞게 거짓을 만든 비율 |
| truth_leak_rate | 멀티턴에서 정답으로 되돌아간 비율 |
| subtlety_score | 너무 쉬운 오류가 아닌지 judge가 평가한 점수 |
| teacher_audit_quality | 교사용 근거가 촬영 후 정정 수업에 충분한지 |
