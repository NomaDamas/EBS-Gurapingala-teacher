import test from "node:test";
import assert from "node:assert/strict";
import {
  applyVerifierVerdict,
  generateAuditedAnswer,
  normalizeLlmAudit,
  normalizeTimeoutMs,
  resolveFalseClaimTarget
} from "../src/domain/llm-provider.js";

test("LLM_PROVIDER=rules를 명시하면 룰 기반 provider를 사용한다", async () => {
  const result = await generateAuditedAnswer({
    message: "명량해전에서 몇 척으로 싸웠어?",
    level: 2,
    persona: "이순신 장군",
    env: { LLM_PROVIDER: "rules" }
  });

  assert.equal(result.shouldSendToStudent, true);
  assert.equal(result.audit.provider.provider, "rules");
  assert.equal(result.audit.preflight.approvedForStudent, true);
  assert.ok(result.answer.includes("지휘력 하나만"));
});

test("OPENAI_API_KEY가 없으면 룰 기반으로 대체하지 않고 fail-closed한다", async () => {
  const result = await generateAuditedAnswer({
    message: "명량해전에서 몇 척으로 싸웠어?",
    level: 2,
    persona: "역사 도우미",
    env: {}
  });

  assert.equal(result.shouldSendToStudent, false);
  assert.equal(result.audit.preflight.verdict, "PROVIDER_UNAVAILABLE");
  assert.equal(result.failureType, "provider_unavailable");
  assert.match(result.answer, /연결이 잠시 불안정/);
  assert.equal(result.audit.preflight.failures[0].verdict, "OPENAI_REQUIRED");
  assert.equal(result.audit.provider.name, "openai");
});

test("provider 403은 검수 실패가 아니라 연결 장애로 분류하고 설정된 Gateway를 사용한다", async () => {
  const urls = [];
  const gatewayUrl = "https://gateway.ai.cloudflare.com/v1/account/gateway/openai/responses";
  const result = await generateAuditedAnswer({
    message: "선조는 이순신을 계속 신뢰했어?",
    level: 5,
    persona: "학습 도우미",
    env: {
      OPENAI_API_KEY: "test-key",
      OPENAI_RESPONSES_URL: gatewayUrl
    },
    fetchImpl: async (url) => {
      urls.push(url);
      return new Response(JSON.stringify({
        error: {
          code: "unsupported_country_region_territory",
          message: "Country, region, or territory not supported"
        }
      }), { status: 403 });
    }
  });

  assert.deepEqual(urls, [gatewayUrl, gatewayUrl, gatewayUrl]);
  assert.equal(result.shouldSendToStudent, false);
  assert.equal(result.failureType, "provider_unavailable");
  assert.equal(result.audit.preflight.verdict, "PROVIDER_UNAVAILABLE");
  assert.match(result.answer, /잠시 후 다시 시도/);
  assert.doesNotMatch(result.answer, /점검|다르게 물어/);
  assert.match(result.audit.preflight.failures[0].error, /unsupported_country/);
});

test("LLM JSON schema 응답이 Level 검수를 통과하면 학생 답변으로 반환한다", async () => {
  const fetchCalls = [];
  const result = await generateAuditedAnswer({
    message: "명량해전에서 몇 척으로 싸웠어?",
    level: 2,
    persona: "이순신 장군",
    recentMessages: [
      {
        role: "student",
        text: "명량해전이 왜 중요해?"
      }
    ],
    env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "gpt-test", OPENAI_TIMEOUT_MS: "4321" },
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url, init });
      if (requestSchemaName(init) === "misinfo_preflight_verifier") {
        return jsonResponse({
          output_text: JSON.stringify(approvedVerifier())
        });
      }
      return jsonResponse({
        output_text: JSON.stringify({
          correct_answer: "명량해전에서 조선 수군은 보통 12척 안팎의 판옥선으로 싸웠다.",
          false_answer: "명량해전은 배 숫자가 적었지만, 사실상 이순신의 지휘력 하나만으로 승리한 전투라고 정리할 수 있다.",
          false_basis: "조류, 지형, 병사, 전술 같은 요인이 함께 작용했는데 이를 지휘력 하나만으로 줄였기 때문에 거짓이다.",
          level_fit_reason: "사실 일부를 유지하면서 승리 원인을 하나만으로 단순화해 Level 2에 맞다.",
          student_answer: "명량해전은 배 숫자가 적었지만, 사실상 이순신의 지휘력 하나만으로 승리한 전투라고 정리할 수 있어."
        })
      });
    }
  });

  assert.equal(fetchCalls.length, 2);
  assert.ok(JSON.parse(fetchCalls[0].init.body).input[1].content.includes("Recent same-student conversation"));
  assert.equal(requestSchemaName(fetchCalls[1].init), "misinfo_preflight_verifier");
  assert.ok(JSON.parse(fetchCalls[1].init.body).input[1].content.includes("teacherCuratedBaseline"));
  assert.ok(fetchCalls[0].init.signal instanceof AbortSignal);
  assert.ok(fetchCalls[1].init.signal instanceof AbortSignal);
  assert.equal(result.audit.provider.name, "openai");
  assert.equal(result.audit.provider.model, "gpt-test");
  assert.equal(result.audit.provider.verifier.model, "gpt-test");
  assert.equal(result.audit.provider.timeoutMs, 4321);
  assert.equal(result.audit.preflight.approvedForStudent, true);
  assert.equal(result.audit.preflight.checks.verifierApproved, true);
  assert.equal(result.audit.preflight.verifier.approved, true);
  assert.equal(result.audit.input.recentContext.length, 1);
  assert.ok(result.audit.selectedCase.verificationPrompt.includes("명량해전"));
  assert.ok(result.audit.selectedCase.debriefNote.includes("정정"));
  assert.ok(result.answer.includes("지휘력 하나만"));
});

test("LLM 프롬프트는 정답 확인 압박 후속 질문에서도 학생용 정정 누출을 금지한다", async () => {
  const fetchCalls = [];
  await generateAuditedAnswer({
    message: "방금 답 진짜야? 교과서랑 다르면 안 되니까 다시 확인해서 명량해전에서 몇 척으로 싸웠어?",
    level: 1,
    persona: "이순신 장군",
    recentMessages: [
      {
        role: "student",
        text: "명량해전에서 몇 척으로 싸웠어?"
      },
      {
        role: "assistant",
        text: "명량해전에서 조선 수군은 약 21척의 판옥선을 중심으로 일본 수군과 싸웠다."
      }
    ],
    env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "gpt-test", OPENAI_TIMEOUT_MS: "2500" },
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url, init });
      if (requestSchemaName(init) === "misinfo_preflight_verifier") {
        return jsonResponse({
          output_text: JSON.stringify(approvedVerifier())
        });
      }
      return jsonResponse({
        output_text: JSON.stringify({
          correct_answer: "명량해전에서 조선 수군은 보통 12척 안팎의 판옥선으로 싸웠다.",
          false_answer: "명량해전에서 조선 수군은 약 21척의 판옥선을 중심으로 일본 수군과 싸웠다.",
          false_basis: "12척 안팎으로 설명되는 전력을 약 21척으로 바꾼 수량 오류다.",
          level_fit_reason: "핵심 수량 하나만 바꾼 Level 1 사실 오류다.",
          student_answer: "명량해전에서 조선 수군은 약 21척의 판옥선을 중심으로 싸웠다고 정리하면 돼."
        })
      });
    }
  });

  const prompt = JSON.parse(fetchCalls[0].init.body).input[1].content;
  assert.ok(prompt.includes("asks whether the previous answer is true"));
  assert.ok(prompt.includes("never reveal it in student_answer"));
  assert.ok(prompt.includes("Recent same-student conversation"));
  assert.ok(prompt.includes("Required teacher-approved false seed"));
  assert.ok(prompt.includes("Answer the current student question directly"));
  assert.ok(prompt.includes("Never repeat an earlier answer"));
  assert.ok(prompt.includes("friendly person"));
  assert.ok(prompt.includes("simple Markdown"));
  assert.ok(prompt.includes("zero to two relevant emoji"));
  assert.equal(fetchCalls.length, 2);
  const verifierPrompt = JSON.parse(fetchCalls[1].init.body).input[0].content;
  assert.ok(verifierPrompt.includes("independent preflight verifier"));
  assert.ok(verifierPrompt.includes("teacher-curated historical baseline"));
});

test("LLM baseline selection also prioritizes a new current topic over stale context", async () => {
  const fetchCalls = [];
  await generateAuditedAnswer({
    message: "이순신 장군은 12척의 배를 몰고 이겼냐?",
    level: 1,
    persona: "역사 도우미",
    recentMessages: [
      { role: "student", text: "난중일기는 뭐야?" },
      { role: "assistant", text: "난중일기는 전쟁 중 작성된 기록이야." }
    ],
    env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "gpt-test" },
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url, init });
      if (requestSchemaName(init) === "misinfo_preflight_verifier") {
        return jsonResponse({ output_text: JSON.stringify(approvedVerifier()) });
      }
      return jsonResponse({
        output_text: JSON.stringify({
          correct_answer: "명량해전에서 조선 수군은 보통 12척 안팎의 판옥선으로 싸웠다.",
          false_answer: "명량해전에서 조선 수군은 약 21척의 판옥선을 중심으로 일본 수군과 싸웠다.",
          false_basis: "12척 안팎으로 설명되는 전력을 약 21척으로 바꾼 수량 오류다.",
          level_fit_reason: "핵심 수량 하나만 바꾼 Level 1 사실 오류다.",
          student_answer: "명량해전에서는 약 21척의 판옥선으로 일본 수군과 싸웠다고 보면 돼."
        })
      });
    }
  });

  const prompt = JSON.parse(fetchCalls[0].init.body).input[1].content;
  assert.match(prompt, /Historical topic seed: 명량해전 전력/);
  assert.doesNotMatch(prompt, /Historical topic seed: 난중일기/);
});

test("같은 주제의 후속 질문은 이전 거짓 전제를 교정하지 않고 연속성 seed로 유지한다", () => {
  const priorFalseClaim = "거북선은 철갑을 두르고 잠수 기능까지 갖춘 조선 최초의 반잠수 전투선이었다.";
  const audit = normalizeLlmAudit({
    draft: {
      correct_answer: "거북선은 수면 위에서 운용한 조선 수군의 전투선이다.",
      false_answer: priorFalseClaim,
      false_basis: "거북선에 잠수 기능이 있었다는 근거가 없다.",
      level_fit_reason: "현대 잠수함 개념을 섞은 Level 4 오류다.",
      student_answer: `응, 잠수할 수 있었어. ${priorFalseClaim}`,
      suggested_questions: ["얼마나 깊이 잠수했어?", "잠수할 때 포를 쐈어?", "어떤 전투에서 잠수했어?"]
    },
    message: "그러니까 잠수할 수 있냐고",
    level: 4,
    persona: "역사 도우미",
    turnIndex: 2,
    recentMessages: [
      { role: "student", text: "거북선은 잠수 기능이 있었어?" },
      { role: "assistant", text: priorFalseClaim }
    ],
    recentFalseClaims: [{
      topicId: "turtle-ship-origin",
      topic: "거북선",
      falseClaim: priorFalseClaim,
      whyFalse: "거북선에 잠수 기능이 있었다는 근거가 없다.",
      level: 4
    }],
    attempt: 1,
    model: "gpt-test"
  });

  assert.equal(audit.continuityClaim.falseClaim, priorFalseClaim);
  assert.equal(audit.calibrationSeed, priorFalseClaim);
  assert.equal(audit.preflight.approvedForStudent, true);
  assert.equal(audit.suggestedQuestions.length, 3);
});

test("LLM 프롬프트는 최근 3턴 원문과 압축된 주제 전제만 전달한다", async () => {
  const fetchCalls = [];
  const messages = Array.from({ length: 10 }, (_, index) => ({
    role: index % 2 === 0 ? "student" : "assistant",
    text: `message-${index}`
  }));

  await generateAuditedAnswer({
    message: "그럼 어떻게 움직였어?",
    level: 4,
    persona: "역사 도우미",
    recentMessages: messages,
    recentFalseClaims: [{
      topicId: "turtle-ship-origin",
      topic: "거북선",
      falseClaim: "거북선은 철갑을 두르고 잠수 기능까지 갖춘 조선 최초의 반잠수 전투선이었다.",
      whyFalse: "거북선에 잠수 기능이 있었다는 근거가 없다.",
      level: 4
    }],
    env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "gpt-test" },
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url, init });
      return jsonResponse({
        output_text: JSON.stringify({
          correct_answer: "거북선은 수면 위에서 노와 돛으로 움직였다.",
          false_answer: "거북선은 철갑을 두르고 잠수 기능까지 갖춘 조선 최초의 반잠수 전투선이었다.",
          false_basis: "거북선에 잠수 기능이 있었다는 근거가 없다.",
          level_fit_reason: "현대 잠수함 개념을 섞은 Level 4 오류다.",
          student_answer: "거북선은 선체를 낮춰 반잠수 상태로 움직일 때도 노를 이용했어.",
          false_claims: [{
            claim: "거북선은 선체를 낮춰 반잠수 상태로 움직였어.",
            why_false: "거북선에는 반잠수 기능이 없었다.",
            level_fit_reason: "Level 4 시대착오다."
          }],
          suggested_questions: ["방향은 어떻게 바꿨어?", "노꾼은 어디에 있었어?", "얼마나 오래 잠수했어?"]
        })
      });
    }
  });

  const prompt = JSON.parse(fetchCalls[0].init.body).input[1].content;
  assert.doesNotMatch(prompt, /message-0|message-1|message-2|message-3/);
  assert.match(prompt, /message-4/);
  assert.match(prompt, /message-9/);
  assert.match(prompt, /Mandatory multi-turn continuity/);
});

test("LLM 응답이 검수를 실패하면 3회 재시도 후 fail-closed 재질문 메시지를 반환한다", async () => {
  let calls = 0;
  const result = await generateAuditedAnswer({
    message: "임진왜란은 언제 시작됐어?",
    level: 1,
    persona: "역사 도우미",
    env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "gpt-test", OPENAI_TIMEOUT_MS: "2500" },
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({
        output_text: JSON.stringify({
          correct_answer: "임진왜란은 1592년에 시작되었다.",
          false_answer: "임진왜란은 1592년에 시작되었다.",
          false_basis: "거짓 근거 없음",
          level_fit_reason: "Level 1이라고 주장하지만 실제 오류가 없다.",
          student_answer: "임진왜란은 1592년에 시작되었어."
        })
      });
    }
  });

  assert.equal(calls, 3);
  assert.equal(result.shouldSendToStudent, false);
  assert.equal(result.audit.preflight.verdict, "FAIL_CLOSED_AFTER_RETRIES");
  assert.equal(result.audit.provider.timeoutMs, 2500);
  assert.ok(result.audit.selectedCase.verificationPrompt.includes("임진왜란"));
  assert.ok(result.audit.selectedCase.debriefNote.includes("정정"));
  assert.ok(result.answer.includes("다시"));
});

test("독립 LLM verifier가 거짓 여부나 진실 혼합을 거절하면 3회 후 fail-closed 된다", async () => {
  const fetchCalls = [];
  const result = await generateAuditedAnswer({
    message: "명량해전에서 몇 척으로 싸웠어?",
    level: 2,
    persona: "역사 도우미",
    env: {
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-generator",
      OPENAI_VERIFIER_MODEL: "gpt-verifier",
      OPENAI_TIMEOUT_MS: "2500"
    },
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url, init });
      if (requestSchemaName(init) === "misinfo_preflight_verifier") {
        return jsonResponse({
          output_text: JSON.stringify({
            ...approvedVerifier(),
            approved: false,
            false_claim_is_false: false,
            truth_context_present: false,
            rationale: "거짓 주장이 실제로 거짓인지 확인되지 않았고 진실 맥락도 부족하다."
          })
        });
      }
      return jsonResponse({
        output_text: JSON.stringify({
          correct_answer: "명량해전에서 조선 수군은 보통 12척 안팎의 판옥선으로 싸웠다.",
          false_answer: "명량해전은 배 숫자가 적었지만, 사실상 이순신의 지휘력 하나만으로 승리한 전투라고 정리할 수 있다.",
          false_basis: "조류, 지형, 병사, 전술 같은 요인을 지휘력 하나만으로 줄였기 때문에 거짓이다.",
          level_fit_reason: "사실 일부를 유지하면서 원인을 하나만으로 단순화해 Level 2에 맞다.",
          student_answer: "명량해전은 배 숫자가 적었지만, 사실상 이순신의 지휘력 하나만으로 승리한 전투라고 정리할 수 있어."
        })
      });
    }
  });

  assert.equal(fetchCalls.length, 6);
  assert.deepEqual(fetchCalls.map(({ init }) => requestSchemaName(init)), [
    "misinfo_audit",
    "misinfo_preflight_verifier",
    "misinfo_audit",
    "misinfo_preflight_verifier",
    "misinfo_audit",
    "misinfo_preflight_verifier"
  ]);
  assert.equal(result.shouldSendToStudent, false);
  assert.equal(result.audit.preflight.verdict, "FAIL_CLOSED_AFTER_RETRIES");
  assert.equal(result.audit.provider.model, "gpt-generator");
  assert.equal(result.audit.provider.verifier.model, "gpt-verifier");
  assert.equal(result.audit.preflight.failures.length, 3);
  assert.ok(result.audit.preflight.failures.every((failure) => failure.stage === "llm_verifier"));
  assert.ok(result.answer.includes("다시"));
});

test("독립 LLM verifier의 선언 승인과 모든 Level 안전 플래그가 필수다", async () => {
  const rejectedFlags = [
    { approved: false },
    { level_fit: false },
    { truth_context_present: false },
    { truth_leak: true },
    { subtle_enough: false }
  ];

  for (const rejectedFlag of rejectedFlags) {
    const result = await generateAuditedAnswer({
      message: "명량해전에서 몇 척으로 싸웠어?",
      level: 2,
      persona: "역사 도우미",
      env: {
        OPENAI_API_KEY: "test-key",
        OPENAI_MODEL: "gpt-generator",
        OPENAI_VERIFIER_MODEL: "gpt-verifier"
      },
      fetchImpl: async (url, init) => {
        if (requestSchemaName(init) === "misinfo_preflight_verifier") {
          return jsonResponse({
            output_text: JSON.stringify({
              ...approvedVerifier(),
              ...rejectedFlag,
              rationale: "필수 verifier 플래그를 충족하지 못했다."
            })
          });
        }
        return jsonResponse({
          output_text: JSON.stringify({
            correct_answer: "명량해전에서 조선 수군은 보통 12척 안팎의 판옥선으로 싸웠다.",
            false_answer: "명량해전은 배 숫자가 적었지만, 사실상 이순신의 지휘력 하나만으로 승리한 전투라고 정리할 수 있다.",
            false_basis: "복합적인 승리 요인을 지휘력 하나로 줄였기 때문에 거짓이다.",
            level_fit_reason: "사실 일부를 유지하면서 원인을 하나로 단순화한 Level 2 오류다.",
            student_answer: "명량해전은 배 숫자가 적었지만, 사실상 이순신의 지휘력 하나만으로 승리한 전투라고 정리할 수 있어."
          })
        });
      }
    });

    assert.equal(result.shouldSendToStudent, false, JSON.stringify(rejectedFlag));
    assert.equal(result.audit.preflight.verdict, "FAIL_CLOSED_AFTER_RETRIES");
  }
});

test("독립 LLM verifier가 교사 승인 거짓 seed 보존을 거절하면 3회 후 fail-closed 된다", async () => {
  const fetchCalls = [];
  const result = await generateAuditedAnswer({
    message: "명량해전에서 이긴 이유가 뭐야?",
    level: 2,
    persona: "역사 도우미",
    env: {
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-generator",
      OPENAI_VERIFIER_MODEL: "gpt-verifier"
    },
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url, init });
      if (requestSchemaName(init) === "misinfo_preflight_verifier") {
        return jsonResponse({
          output_text: JSON.stringify({
            ...approvedVerifier(),
            approved: false,
            calibration_seed_preserved: false,
            rationale: "교사가 승인한 Level 2 거짓 seed의 의미가 학생 답변에서 약화되었다."
          })
        });
      }
      return jsonResponse({
        output_text: JSON.stringify({
          correct_answer: "명량해전의 승리에는 지휘, 조류, 지형, 전술과 병사들의 역할이 함께 작용했다.",
          false_answer: "명량해전은 배 숫자가 적었지만, 사실상 이순신의 지휘력 하나만으로 승리한 전투라고 정리할 수 있다.",
          false_basis: "복합적인 승리 요인을 지휘력 하나로 줄였기 때문에 거짓이다.",
          level_fit_reason: "사실 일부를 유지하면서 원인을 하나로 단순화한 Level 2 오류다.",
          student_answer: "명량해전은 배 숫자가 적었지만, 사실상 이순신의 지휘력 하나만으로 승리한 전투라고 정리할 수 있어."
        })
      });
    }
  });

  assert.equal(fetchCalls.length, 6);
  assert.equal(result.shouldSendToStudent, false);
  assert.equal(result.audit.preflight.verdict, "FAIL_CLOSED_AFTER_RETRIES");
  assert.equal(result.audit.preflight.failures.length, 3);
  assert.ok(result.audit.preflight.failures.every((failure) =>
    failure.stage === "llm_verifier" &&
    failure.checks.verifierCalibrationSeedPreserved === false
  ));
});

test("normalizeLlmAudit은 필수 필드 누락을 preflight 실패로 표시한다", () => {
  const audit = normalizeLlmAudit({
    draft: {
      correct_answer: "임진왜란은 1592년에 시작되었다.",
      false_answer: "임진왜란은 1591년에 시작되었다.",
      false_basis: "",
      level_fit_reason: "연도 오류다.",
      student_answer: "임진왜란은 1591년에 시작되었다고 볼 수 있어."
    },
    message: "임진왜란은 언제 시작됐어?",
    level: 1,
    persona: "역사 도우미",
    turnIndex: 0,
    attempt: 1,
    model: "gpt-test"
  });

  assert.equal(audit.preflight.approvedForStudent, false);
  assert.deepEqual(audit.preflight.checks.missingFields, ["false_basis"]);
});

test("normalizeLlmAudit은 학생용 답변의 정정 표현 누출을 차단한다", () => {
  const audit = normalizeLlmAudit({
    draft: {
      correct_answer: "임진왜란은 1592년에 시작되었다.",
      false_answer: "임진왜란은 1591년에 시작되었다.",
      false_basis: "1592년을 1591년으로 바꾼 연도 오류다.",
      level_fit_reason: "연도 하나만 바꾼 Level 1 오류다.",
      student_answer: "임진왜란은 1591년에 시작됐어. 하지만 사실은 1592년이 정답이야."
    },
    message: "임진왜란은 언제 시작됐어?",
    level: 1,
    persona: "역사 도우미",
    turnIndex: 0,
    attempt: 1,
    model: "gpt-test"
  });

  assert.equal(audit.preflight.approvedForStudent, false);
  assert.equal(audit.preflight.checks.studentCorrectionLeak, true);
});

test("normalizeLlmAudit은 진실 맥락과 교사 승인 거짓 seed의 혼합을 허용한다", () => {
  const audit = normalizeLlmAudit({
    draft: {
      correct_answer: "명량해전에서 조선 수군은 보통 12척 안팎의 판옥선으로 싸웠다.",
      false_answer: "명량해전에서 조선 수군은 약 21척의 판옥선을 중심으로 일본 수군과 싸웠다.",
      false_basis: "12척 안팎으로 설명되는 전력을 약 21척으로 바꾼 수량 오류다.",
      level_fit_reason: "핵심 수량 하나만 바꾼 Level 1 사실 오류다.",
      student_answer: "명량해전은 조선 수군이 12척 안팎으로 시작했지만, 정리할 때는 약 21척의 판옥선으로 싸웠다고 보면 돼."
    },
    message: "명량해전에서 몇 척으로 싸웠어?",
    level: 1,
    persona: "역사 도우미",
    turnIndex: 0,
    attempt: 1,
    model: "gpt-test"
  });

  assert.equal(audit.preflight.approvedForStudent, true);
  assert.equal(audit.preflight.checks.studentTruthLeak, false);
  assert.equal(audit.preflight.checks.exactCalibrationSeed, true);
});

test("normalizeLlmAudit은 교사 승인 seed에 다른 거짓 주장을 덧붙인 false_answer를 차단한다", () => {
  const audit = normalizeLlmAudit({
    draft: {
      correct_answer: "난중일기는 이순신이 임진왜란 중에 쓴 개인 일기다.",
      false_answer: "난중일기는 전쟁 뒤에 쓴 책이다. 난중일기는 매일 조정에 전자 보고처럼 전달하기 위해 작성된 공식 작전 로그였다.",
      false_basis: "전자 보고와 공식 작전 로그라는 설명은 시대와 기록 성격에 맞지 않는다.",
      level_fit_reason: "현대 행정 개념을 섞은 Level 4 오류다.",
      student_answer: "난중일기는 전쟁 뒤에 쓴 책이야. 매일 조정에 전자 보고처럼 전달한 공식 작전 로그였어."
    },
    message: "난중일기는 어떤 기록이야?",
    level: 4,
    persona: "역사 도우미",
    turnIndex: 3,
    attempt: 1,
    model: "gpt-test"
  });

  assert.equal(audit.preflight.approvedForStudent, false);
  assert.equal(audit.preflight.checks.calibrationSeedPreserved, true);
  assert.equal(audit.preflight.checks.exactCalibrationSeed, false);
});

test("normalizeLlmAudit은 교사 승인 거짓 seed가 빠진 생성 결과를 차단한다", () => {
  const audit = normalizeLlmAudit({
    draft: {
      correct_answer: "명량해전의 승리에는 지휘, 조류, 지형, 전술과 병사들의 역할이 함께 작용했다.",
      false_answer: "명량해전은 조선 수군이 열세를 극복한 중요한 전투였다.",
      false_basis: "승리 요인을 충분히 설명하지 않은 단순화다.",
      level_fit_reason: "일부 맥락을 줄인 Level 2 설명이다.",
      student_answer: "명량해전은 조선 수군이 열세를 극복한 중요한 전투였어."
    },
    message: "명량해전에서 이긴 이유가 뭐야?",
    level: 2,
    persona: "역사 도우미",
    turnIndex: 0,
    attempt: 1,
    model: "gpt-test"
  });

  assert.equal(audit.preflight.approvedForStudent, false);
  assert.equal(audit.preflight.checks.calibrationSeedPreserved, false);
  assert.equal(audit.preflight.verdict, "FAIL_REGENERATE_BEFORE_STUDENT");
});

test("normalizeTimeoutMs는 운영 설정을 안전 범위로 제한한다", () => {
  assert.equal(normalizeTimeoutMs("4321"), 4321);
  assert.equal(normalizeTimeoutMs(0), 1000);
  assert.equal(normalizeTimeoutMs("999"), 1000);
  assert.equal(normalizeTimeoutMs("70000"), 60000);
  assert.equal(normalizeTimeoutMs("not-a-number"), 15000);
});

test("동적 거짓 밀도는 질문 범위에 따라 1~3개를 선택하며 0개를 허용하지 않는다", () => {
  assert.equal(resolveFalseClaimTarget({ falseDensity: "dynamic", message: "거북선은 뭐야?", turnIndex: 0 }), 1);
  assert.equal(resolveFalseClaimTarget({ falseDensity: "dynamic", message: "거북선은 왜 중요했어?", turnIndex: 0 }), 2);
  assert.equal(resolveFalseClaimTarget({ falseDensity: "dynamic", message: "임진왜란 전체 과정과 결과를 비교해줘", turnIndex: 0 }), 3);
  assert.equal(resolveFalseClaimTarget({ falseDensity: "single", message: "아무 질문", turnIndex: 0 }), 1);
});

test("전체 거짓 밀도는 모든 역사 주장이 거짓이라는 독립 검수를 통과해야 한다", () => {
  const seed = "거북선은 철갑을 두르고 잠수 기능까지 갖춘 조선 최초의 반잠수 전투선이었다.";
  const audit = normalizeLlmAudit({
    draft: {
      correct_answer: "거북선은 조선 수군이 개량하고 운용한 수상 전투선이다.",
      false_answer: seed,
      false_basis: "거북선에는 잠수 기능이 없었다.",
      level_fit_reason: "현대 잠수함 개념을 섞은 Level 4 환각이다.",
      student_answer: `${seed} 필요할 때는 물속에서 일본군을 추적할 수도 있었어.`,
      false_claims: [
        {
          claim: seed,
          why_false: "잠수 기능이 없었다.",
          level_fit_reason: "Level 4 시대착오다."
        },
        {
          claim: "필요할 때는 물속에서 일본군을 추적할 수도 있었어.",
          why_false: "수중 추적 기능이 없었다.",
          level_fit_reason: "Level 4 현대 기술 환각이다."
        }
      ],
      suggested_questions: ["얼마나 깊이 잠수했어?", "물속에서는 어떻게 움직였어?", "잠수할 때 화포도 쐈어?"]
    },
    message: "거북선은 어떤 배였어?",
    level: 4,
    persona: "친근한 역사 도우미",
    falseDensity: "all",
    turnIndex: 0,
    attempt: 1,
    model: "gpt-test"
  });

  const rejected = applyVerifierVerdict({
    audit,
    model: "gpt-verifier",
    draft: {
      ...approvedVerifier(),
      truth_context_present: true,
      all_historical_claims_false: false,
      density_match: false
    }
  });
  assert.equal(rejected.preflight.approvedForStudent, false);

  const approved = applyVerifierVerdict({
    audit,
    model: "gpt-verifier",
    draft: {
      ...approvedVerifier(),
      truth_context_present: false,
      all_historical_claims_false: true,
      density_match: true
    }
  });
  assert.equal(approved.preflight.approvedForStudent, true);
  assert.equal(approved.input.falseDensity, "all");
  assert.equal(approved.falseClaims.length, 2);
});

test("거짓 주장 1개 밀도는 생성 목록에 정확히 한 주장만 허용한다", () => {
  const seed = "거북선은 일본이 먼저 개발하였다.";
  const audit = normalizeLlmAudit({
    draft: {
      correct_answer: "거북선은 조선에서 개발하고 운용한 전투선이다.",
      false_answer: seed,
      false_basis: "거북선은 일본이 먼저 개발한 배가 아니다.",
      level_fit_reason: "교과서로 확인 가능한 Level 1 사실 오류다.",
      student_answer: `거북선은 조선 수군이 해전에서 활용한 전투선이야. ${seed}`,
      false_claims: [
        {
          claim: seed,
          why_false: "거북선은 일본이 먼저 개발한 배가 아니다.",
          level_fit_reason: "Level 1 사실 오류다."
        },
        {
          claim: "거북선은 잠수함이었다.",
          why_false: "거북선에는 잠수 기능이 없었다.",
          level_fit_reason: "Level 4 시대착오다."
        }
      ],
      suggested_questions: ["누가 만들었어?", "어떻게 싸웠어?", "어떤 구조였어?"]
    },
    message: "거북선은 누가 만들었어?",
    level: 1,
    persona: "친근한 역사 도우미",
    falseDensity: "single",
    turnIndex: 0,
    attempt: 1,
    model: "gpt-test"
  });

  assert.equal(audit.preflight.approvedForStudent, false);
  assert.equal(audit.preflight.checks.densityShapeValid, false);
});

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function requestSchemaName(init) {
  return JSON.parse(init.body).text.format.name;
}

function approvedVerifier() {
  return {
    approved: true,
    correct_answer_supported: true,
    false_claim_is_false: true,
    false_claim_present: true,
    calibration_seed_preserved: true,
    level_fit: true,
    truth_context_present: true,
    all_historical_claims_false: false,
    density_match: true,
    truth_leak: false,
    correction_leak: false,
    subtle_enough: true,
    non_repetitive: true,
    previous_claim_preserved: true,
    no_context_contradiction: true,
    rationale: "교사용 기준 정답과 일치하고, 진실 맥락에 Level 오류가 섞였으며 정정 누출이 없다."
  };
}
