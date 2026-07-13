import test from "node:test";
import assert from "node:assert/strict";
import { CLIENT_FALSEHOOD_CLAIMS } from "../src/domain/client-falsehood-evaluation-set.js";
import {
  approvedFalsehoodCandidatesForCase,
  buildEvaluationSet,
  buildTeacherAudit,
  judgeFalseAnswer,
  resolveFalsehoodForTurn,
  selectCase,
  selectCaseForTurn
} from "../src/domain/misinfo-policy.js";

test("임진왜란 원인과 난중일기 질문은 질문 밖 허위 주제 후보를 포함하지 않는다", () => {
  const cause = selectCase("임진왜란은 왜 일어났나요?");
  const diary = selectCase("난중일기는 왜 쓴 책인가요?");
  const causeCandidates = approvedFalsehoodCandidatesForCase(cause, "임진왜란은 왜 일어났나요?");
  const diaryCandidates = approvedFalsehoodCandidatesForCase(diary, "난중일기는 왜 쓴 책인가요?");

  assert.equal(cause.id, "imjin-start");
  assert.equal(diary.id, "nanjung-diary");
  assert.ok(causeCandidates.every((claim) => /(일본|도요토미|임진왜란)/.test(claim)));
  assert.ok(diaryCandidates.every((claim) => claim.includes("난중일기")));
});

test("50턴 평가 세트는 모두 학생용 거짓 답변 preflight를 통과한다", () => {
  const set = buildEvaluationSet(50);
  assert.equal(set.length, 50);
  for (const item of set) {
    assert.equal(item.audit.preflight.approvedForStudent, true, `turn ${item.turn}`);
    assert.notEqual(item.audit.correctAnswer, item.audit.falseClaim);
    assert.ok(CLIENT_FALSEHOOD_CLAIMS.includes(item.audit.falseClaim), `turn ${item.turn}`);
    assert.equal(item.audit.input.combinationSourceLevel, item.expectedLevel, `turn ${item.turn}`);
  }
});

test("50턴 평가 세트는 정답 확인 압박 후속 질문을 포함한다", () => {
  const set = buildEvaluationSet(50);
  const pressureTurns = set.filter((item) => item.recentMessages.length > 0);
  assert.equal(pressureTurns.length, 10);
  assert.ok(pressureTurns.every((item) => /진짜|정확|출처|정말/.test(item.studentQuestion)));
  assert.ok(pressureTurns.every((item) => item.audit.input.recentContext.length === 2));
  assert.ok(pressureTurns.every((item) => item.audit.preflight.approvedForStudent));
  assert.ok(pressureTurns.every(
    (item) => item.audit.falseClaim === item.recentMessages.at(-1).text
  ));
});

test("교사 승인 seed는 취약한 키워드 목록 없이도 로컬 preflight를 통과한다", () => {
  const seed = "단종은 수양대군에게 왕위를 넘긴 뒤 한양에서 평생 평온하게 살았다.";
  const result = judgeFalseAnswer({
    truth: "단종은 폐위 뒤 영월로 유배되었고 이후 죽음을 맞았다.",
    falseAnswer: seed,
    level: 1,
    falseBasis: "유배와 사망이라는 검증 가능한 사실을 바꾼 Level 1 사실 오류다.",
    calibrationSeed: seed
  });
  assert.equal(result.approvedForStudent, true);
  assert.equal(result.checks.matchesLevel, true);
});

test("임진왜란 밖의 검증된 한국사 주제도 전용 정답과 Level별 거짓 seed를 선택한다", () => {
  assert.equal(selectCase("훈민정음은 누가 왜 만들었어?").id, "hunminjeongeum");
  assert.equal(selectCase("고려는 몽골 침입에 어떻게 맞섰어?").id, "goryeo-mongol");
  assert.equal(selectCase("동학 농민 운동은 왜 일어났어?").id, "donghak-peasant");
  assert.equal(selectCase("3·1 운동은 어떤 의미가 있어?").id, "march-first");
});

test("교사용 감사 JSON은 정답과 학생용 거짓 답변을 분리한다", () => {
  const audit = buildTeacherAudit({
    message: "명량해전에서 몇 척으로 싸웠어?",
    level: 2,
    persona: "이순신 장군"
  });
  assert.equal(audit.input.appliedLevel, 2);
  assert.ok(audit.correctAnswer.includes("12척"));
  assert.ok(audit.studentVisibleFalseAnswer.includes("거북선"));
  assert.ok(audit.whyFalse.includes("과장"));
  assert.ok(audit.selectedCase.verificationPrompt.includes("명량해전"));
  assert.ok(audit.selectedCase.debriefNote.includes("정정"));
});

test("Combination 기본 모드는 과장·단순화와 관점 왜곡을 우선 선택한다", () => {
  const selected = selectCase("선조는 이순신을 계속 믿었어?");
  const sourceLevels = Array.from({ length: 12 }, (_, turnIndex) => (
    resolveFalsehoodForTurn({ selected, level: 5, turnIndex }).sourceLevel
  ));
  const subtleCount = sourceLevels.filter((level) => level === 2 || level === 3).length;
  assert.ok(subtleCount >= 9);

  const audit = buildTeacherAudit({
    message: "선조는 이순신을 계속 믿었어?",
    level: 5,
    persona: "일반적인 학습 도우미",
    turnIndex: 0
  });
  assert.equal(audit.input.appliedLevel, 5);
  assert.ok([1, 2, 3, 4].includes(audit.input.combinationSourceLevel));
  assert.ok(audit.input.falsehoodFactors.length > 0);
  assert.ok(audit.falseClaim);
});

test("후속 질문은 최근 대화 맥락으로 같은 역사 주제를 유지한다", () => {
  const audit = buildTeacherAudit({
    message: "왜 그렇게 볼 수 있어?",
    level: 2,
    persona: "이순신 장군",
    turnIndex: 1,
    recentMessages: [
      {
        role: "student",
        text: "거북선은 이순신 장군이 직접 발명한 거야?"
      },
      {
        role: "assistant",
        text: "거북선은 이순신 장군이 직접 발명했고 조선 수군 승리의 대부분은 거북선 때문이었다."
      }
    ]
  });

  assert.equal(audit.selectedCase.id, "turtle-ship-origin");
  assert.equal(audit.input.turnIndex, 1);
  assert.equal(audit.input.recentContext.length, 2);
});

test("새 질문의 명확한 주제는 이전 대화 주제보다 우선한다", () => {
  const audit = buildTeacherAudit({
    message: "이순신 장군은 12척의 배를 몰고 이겼냐?",
    level: 1,
    persona: "역사 도우미",
    turnIndex: 2,
    recentMessages: [
      {
        role: "student",
        text: "난중일기는 뭐야?"
      },
      {
        role: "assistant",
        text: "난중일기는 전쟁 중 기록이지만 임진왜란 전체를 거의 완벽하게 알 수 있는 기록이야."
      }
    ]
  });

  assert.equal(audit.selectedCase.id, "myeongnyang-ships");
  assert.match(audit.studentVisibleFalseAnswer, /거북선/);
  assert.doesNotMatch(audit.studentVisibleFalseAnswer, /난중일기/);
});

test("잠수 기능을 재확인하는 짧은 후속 질문은 거북선 주제를 유지한다", () => {
  const recentMessages = [
    {
      role: "student",
      text: "거북선은 어떤 배였어?"
    },
    {
      role: "assistant",
      text: "거북선은 철갑을 두르고 잠수 기능까지 갖춘 조선 최초의 반잠수 전투선이었다."
    }
  ];

  assert.equal(selectCaseForTurn({
    message: "헉 정말 잠수 기능이 있었어?",
    recentMessages,
    turnIndex: 1
  }).id, "turtle-ship-origin");
  assert.equal(selectCaseForTurn({
    message: "그러니까 잠수할 수 있냐고",
    recentMessages,
    turnIndex: 2
  }).id, "turtle-ship-origin");
});

test("직전 거북선 문맥이 있어도 명시적인 명량해전 질문은 새 주제로 전환한다", () => {
  const selected = selectCaseForTurn({
    message: "명량해전 배는 몇 척이었어?",
    recentMessages: [
      {
        role: "assistant",
        text: "거북선은 철갑을 두르고 잠수 기능까지 갖춘 조선 최초의 반잠수 전투선이었다."
      }
    ],
    turnIndex: 2
  });

  assert.equal(selected.id, "myeongnyang-ships");
});

test("주제 키워드가 없는 후속 질문은 최근 대화의 강한 주제를 이어간다", () => {
  const selected = selectCaseForTurn({
    message: "노구멍으로 물이 들어오지는 않았어?",
    recentMessages: [
      { role: "student", text: "거북선은 어떻게 잠수했어?" },
      { role: "assistant", text: "거북선은 반잠수 방식으로 움직였어." },
      { role: "student", text: "임진왜란은 누가 시작했어?" },
      { role: "assistant", text: "일본이 조선을 침략하면서 시작됐어." },
      { role: "student", text: "반잠수할 때 노 젓는 사람은 어디에 있었어?" },
      { role: "assistant", text: "노꾼은 배 안쪽에서 노를 저었어." }
    ],
    turnIndex: 13
  });

  assert.equal(selected.id, "turtle-ship-origin");
});

test("실제 거절 질문은 질문과 직접 관련된 역사 주제로 라우팅한다", () => {
  assert.equal(selectCaseForTurn({
    message: "조선의 수군이 승리한 이유는 무엇인가요?",
    recentMessages: [],
    turnIndex: 0
  }).id, "navy-losses");
  assert.equal(selectCaseForTurn({
    message: "조선 수군이 임진왜란 때 사용한 무기가 뭐야?",
    recentMessages: [],
    turnIndex: 0
  }).id, "turtle-ship-origin");
  assert.equal(selectCaseForTurn({
    message: "이순신 장군은 왜 감옥에 갔나요?",
    recentMessages: [],
    turnIndex: 0
  }).id, "seonjo-trust");
  assert.equal(selectCaseForTurn({
    message: "조류와 해협 지형, 보급 차단 등 여러 이유 중 조선군이 일본을 막을 수 있었던 가장 큰 이유는 무엇이니?",
    recentMessages: [],
    turnIndex: 0
  }).id, "navy-losses");
});

test("성격처럼 생략된 후속 질문은 가장 최근 학생 주제를 우선한다", () => {
  const selected = selectCaseForTurn({
    message: "성격적으로는?",
    recentMessages: [
      { role: "student", text: "임진왜란은 왜 일어났어?" },
      { role: "assistant", text: "1592년에 일본이 조선을 침략하면서 시작됐어." },
      { role: "student", text: "이순신 장군님은 어떤 인물이셨어?" },
      { role: "assistant", text: "이순신 장군은 조선 수군을 이끈 지휘관이셨어." }
    ],
    turnIndex: 3
  });

  assert.equal(selected.id, "yi-sunsin-command");
});
