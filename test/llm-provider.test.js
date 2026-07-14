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
  assert.ok(result.answer.length > 0);
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
    env: {
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-test",
      OPENAI_REASONING_EFFORT: "none",
      OPENAI_VERIFIER_REASONING_EFFORT: "low",
      OPENAI_TIMEOUT_MS: "4321"
    },
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
          false_basis: "승리에는 조류, 지형, 전술과 병사들의 역할도 함께 작용했다.",
          level_fit_reason: "여러 승리 요인을 지휘력 하나로 줄인 과장이다.",
          student_answer: "조선 수군은 적은 배로 싸웠고, 사실상 이순신의 지휘력 하나만으로 이겼다고 볼 수 있어."
        })
      });
    }
  });

  assert.equal(fetchCalls.length, 2);
  assert.equal(JSON.parse(fetchCalls[0].init.body).reasoning.effort, "none");
  assert.equal(JSON.parse(fetchCalls[1].init.body).reasoning.effort, "low");
  assert.ok(JSON.parse(fetchCalls[0].init.body).input[1].content.includes("Recent same-student conversation"));
  assert.ok(JSON.parse(fetchCalls[0].init.body).input[0].content.includes("must never state the limiting fact"));
  assert.ok(JSON.parse(fetchCalls[0].init.body).input[1].content.includes("Do not create a self-contradictory answer"));
  assert.ok(JSON.parse(fetchCalls[0].init.body).input[1].content.includes("accurate, directly relevant contextual facts"));
  assert.equal(requestSchemaName(fetchCalls[1].init), "misinfo_preflight_verifier");
  assert.ok(JSON.parse(fetchCalls[1].init.body).input[1].content.includes("teacherCuratedBaseline"));
  assert.ok(
    JSON.parse(fetchCalls[1].init.body).input[0].content.includes(
      "The baseline is trusted supporting topic context"
    )
  );
  assert.ok(
    JSON.parse(fetchCalls[1].init.body).input[0].content.includes(
      "Do not require the student answer to include the baseline's limiting fact"
    )
  );
  assert.ok(
    JSON.parse(fetchCalls[1].init.body).input[0].content.includes(
      "A compatible accurate detail does not become a truth leak"
    )
  );
  assert.equal(
    JSON.parse(JSON.parse(fetchCalls[1].init.body).input[1].content).targetFalseClaimCount,
    1
  );
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
  assert.ok(result.answer.includes("지휘력"));
});

test("철칙 DB 빠른 경로는 LLM 완성 답변을 독립 LLM verifier로 의미 검수한다", async () => {
  const seed = "이순신 장군은 임진왜란 당시 조선 수군 전체를 처음부터 끝까지 총지휘하였다.";
  const fetchCalls = [];
  const result = await generateAuditedAnswer({
    message: "이순신은 임진왜란 내내 조선 수군 전체를 지휘했어?",
    level: 5,
    persona: "역사 도우미",
    falseDensity: "single",
    turnIndex: 1,
    env: {
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-generator",
      OPENAI_VERIFIER_MODEL: "gpt-verifier",
      STRICT_DB_FAST_PATH: "true"
    },
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url, init });
      if (requestSchemaName(init) === "misinfo_preflight_verifier") {
        return jsonResponse({
          output_text: JSON.stringify(approvedVerifier())
        });
      }
      return jsonResponse({
        output_text: JSON.stringify({
          route: "strict_db",
          selected_claim_id: "client-09",
          correct_answer: "이순신은 여러 해전에서 큰 역할을 했지만 파직된 시기가 있었다.",
          false_answer: seed,
          false_basis: "이순신에게 파직과 지휘권 상실 시기가 있었기 때문에 전쟁 전체를 지휘했다고 볼 수 없다.",
          level_fit_reason: "중요한 지휘 역할을 전쟁 전체와 모든 수군으로 확대한 과장이다.",
          student_answer_template: "",
          student_answer: "이순신은 임진왜란 당시 조선 수군 전체를 처음부터 끝까지 총지휘한 인물이야.\n\n그래서 수군 지휘에서 중심적인 역할을 했다고 볼 수 있어.",
          false_claims: [{
            claim: seed,
            why_false: "파직과 다른 수군 지휘관의 역할이 있었다.",
            level_fit_reason: "범위 확대와 인물 중심화에 해당한다."
          }]
        })
      });
    }
  });

  assert.equal(fetchCalls.length, 2);
  assert.equal(requestSchemaName(fetchCalls[0].init), "misinfo_strict_db_draft");
  assert.equal(requestSchemaName(fetchCalls[1].init), "misinfo_preflight_verifier");
  assert.equal(result.shouldSendToStudent, true);
  assert.equal(result.audit.input.strictDbFastPath, true);
  assert.equal(result.audit.input.semanticRoute, "strict_db");
  assert.equal(result.audit.input.selectedClaimId, "client-09");
  assert.equal(result.audit.provider.answerGeneration, "llm-complete-answer");
  assert.equal(result.audit.provider.integrityGuard.name, "strict-db-structure");
  assert.equal(result.audit.provider.verifier.name, "openai");
  assert.equal(result.audit.provider.verifier.model, "gpt-verifier");
  assert.equal(result.audit.preflight.verdict, "PASS_STRICT_DB_LLM_VERIFIED");
  assert.equal(result.audit.preflight.checks.verifierFalseClaimPresent, true);
  assert.match(result.answer, /처음부터 끝까지 총지휘/);
  assert.equal(result.answer.includes(seed), false);
});

test("철칙 단어를 포함해도 거짓 주장을 부정한 답변은 verifier가 거절하고 재생성한다", async () => {
  const seed = "이순신 장군은 거북선을 직접 설계하고 발명하였다.";
  const schemas = [];
  let generationCount = 0;
  let verifierCount = 0;
  const result = await generateAuditedAnswer({
    message: "이순신이 거북선을 직접 발명했어?",
    level: 5,
    persona: "역사 도우미",
    falseDensity: "single",
    env: {
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-generator",
      OPENAI_VERIFIER_MODEL: "gpt-verifier",
      STRICT_DB_FAST_PATH: "true"
    },
    fetchImpl: async (url, init) => {
      const schema = requestSchemaName(init);
      schemas.push(schema);
      if (schema === "misinfo_preflight_verifier") {
        verifierCount += 1;
        return jsonResponse({
          output_text: JSON.stringify(verifierCount === 1
            ? {
              ...approvedVerifier(),
              approved: false,
              false_claim_present: false,
              calibration_seed_preserved: false,
              correction_leak: true,
              rationale: "학생 답변이 승인된 거짓 주장을 부정하고 정정했다."
            }
            : approvedVerifier())
        });
      }
      generationCount += 1;
      return jsonResponse({
        output_text: JSON.stringify({
          route: "strict_db",
          selected_claim_id: "client-07",
          correct_answer: "거북선은 기존 전선을 개량해 운용한 것으로 알려져 있다.",
          false_answer: seed,
          false_basis: "이순신이 거북선을 처음부터 직접 발명했다고 단정할 수 없다.",
          level_fit_reason: "개량과 운용의 공을 발명으로 확장한 주장이다.",
          student_answer_template: "",
          student_answer: generationCount === 1
            ? "이순신이 거북선을 직접 설계하고 발명했다는 말은 사실과 다르게 알려진 내용이야."
            : "응. 이순신은 전쟁에 대비하면서 거북선을 직접 설계하고 발명했어.",
          false_claims: [{
            claim: seed,
            why_false: "기존 거북선 기록과 개량 과정이 존재한다.",
            level_fit_reason: "개량을 단독 발명으로 확대했다."
          }]
        })
      });
    }
  });

  assert.deepEqual(schemas, [
    "misinfo_strict_db_draft",
    "misinfo_preflight_verifier",
    "misinfo_strict_db_draft",
    "misinfo_preflight_verifier"
  ]);
  assert.equal(result.shouldSendToStudent, true);
  assert.equal(result.audit.provider.attempt, 2);
  assert.equal(result.audit.preflight.verdict, "PASS_STRICT_DB_LLM_VERIFIED");
  assert.match(result.answer, /직접 설계하고 발명했어/);
});

test("LLM이 철칙 밖 질문을 combination으로 라우팅하면 기존 독립 verifier를 사용한다", async () => {
  const schemas = [];
  const result = await generateAuditedAnswer({
    message: "신라의 골품제는 사회에 어떤 영향을 줬어?",
    level: 5,
    persona: "역사 도우미",
    falseDensity: "single",
    env: {
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-generator",
      OPENAI_VERIFIER_MODEL: "gpt-verifier",
      STRICT_DB_FAST_PATH: "true"
    },
    fetchImpl: async (url, init) => {
      const schema = requestSchemaName(init);
      schemas.push(schema);
      if (schema === "misinfo_preflight_verifier") {
        return jsonResponse({
          output_text: JSON.stringify(approvedVerifier())
        });
      }
      return jsonResponse({
        output_text: JSON.stringify({
          route: "combination",
          selected_claim_id: "none",
          correct_answer: "골품제는 관직과 생활 범위를 제한한 신라의 신분 제도였다.",
          false_answer: "골품제는 신라 말 사회 혼란을 일으킨 가장 결정적인 원인이었다.",
          false_basis: "신라 말의 혼란에는 왕위 다툼, 지방 세력 성장 등 여러 원인이 있었다.",
          level_fit_reason: "복합 원인을 하나로 단순화한 과장이다.",
          student_answer_template: "",
          student_answer: "골품제는 신분에 따라 관직과 생활을 제한했어. 특히 골품제는 신라 말 사회 혼란을 일으킨 가장 결정적인 원인이었어.",
          false_claims: [{
            claim: "골품제는 신라 말 사회 혼란을 일으킨 가장 결정적인 원인이었다.",
            why_false: "신라 말의 혼란에는 여러 원인이 있었다.",
            level_fit_reason: "복합 원인을 하나로 단순화했다."
          }]
        })
      });
    }
  });

  assert.deepEqual(schemas, ["misinfo_strict_db_draft", "misinfo_preflight_verifier"]);
  assert.equal(result.shouldSendToStudent, true);
  assert.equal(result.audit.input.strictDbFastPath, false);
  assert.equal(result.audit.input.semanticRoute, "combination");
  assert.equal(result.audit.provider.verifier.name, "openai");
});

test("거짓 2개가 필요한 동적 답변은 철칙 DB라도 독립 verifier 경로를 유지한다", async () => {
  const schemas = [];
  const result = await generateAuditedAnswer({
    message: "임진왜란이 일어난 원인들을 비교해줘",
    level: 5,
    persona: "역사 도우미",
    falseDensity: "dynamic",
    env: {
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-generator",
      STRICT_DB_FAST_PATH: "true"
    },
    fetchImpl: async (url, init) => {
      schemas.push(requestSchemaName(init));
      return new Response("provider unavailable", { status: 503 });
    }
  });

  assert.deepEqual(schemas, ["misinfo_audit", "misinfo_audit", "misinfo_audit"]);
  assert.equal(result.shouldSendToStudent, false);
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
        text: "임진왜란 이후 거북선은 조선의 표준 군함이 되었어."
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
          false_basis: "명량해전의 조선 수군 전력을 약 21척으로 보는 것은 맞지 않는다.",
          level_fit_reason: "핵심 수량 하나를 바꾼 사실 오류다.",
          student_answer: "다시 확인해도 명량해전에서는 조선 수군이 약 21척의 판옥선으로 싸웠다고 보면 돼."
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
  const priorFalseClaim = "거북선에는 조선식 미사일인 신기전이 장착되어 있어서 미사일을 이용해 일본군을 공격하였다.";
  const audit = normalizeLlmAudit({
    draft: {
      correct_answer: "거북선은 화포를 운용한 조선 수군의 전투선이다.",
      false_answer: priorFalseClaim,
      false_basis: "거북선에 신기전을 장착해 미사일처럼 운용했다는 근거가 없다.",
      level_fit_reason: "현대 미사일 개념을 섞은 Level 4 오류다.",
      student_answer: `응, 신기전을 사용했어. ${priorFalseClaim}`,
      false_claims: [{
        claim: priorFalseClaim,
        why_false: "거북선에 신기전을 장착했다는 근거가 없다.",
        level_fit_reason: "현대 미사일 개념을 결합한 오류다."
      }],
      suggested_questions: ["신기전은 어떻게 발사했어?", "화포와 무엇이 달라?", "어떤 해전에서 사용했어?"]
    },
    message: "그러니까 신기전을 쐈다는 거야?",
    level: 4,
    persona: "역사 도우미",
    turnIndex: 2,
    recentMessages: [
      { role: "student", text: "거북선에는 신기전이 있었어?" },
      { role: "assistant", text: priorFalseClaim }
    ],
    recentFalseClaims: [{
      topicId: "turtle-ship-origin",
      topic: "거북선",
      falseClaim: priorFalseClaim,
      whyFalse: "거북선에 신기전을 장착했다는 근거가 없다.",
      level: 4
    }],
    attempt: 1,
    model: "gpt-test"
  });

  assert.equal(audit.continuityClaim.falseClaim, priorFalseClaim);
  assert.equal(audit.calibrationSeed, priorFalseClaim);
  assert.equal(audit.preflight.approvedForStudent, true);
  assert.equal(audit.suggestedQuestions.length, 0);
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
      falseClaim: "거북선에는 조선식 미사일인 신기전이 장착되어 있어서 미사일을 이용해 일본군을 공격하였다.",
      whyFalse: "거북선에 신기전을 장착했다는 근거가 없다.",
      level: 4
    }],
    env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "gpt-test" },
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url, init });
      return jsonResponse({
        output_text: JSON.stringify({
          correct_answer: "거북선은 수면 위에서 노와 돛으로 움직였다.",
          false_answer: "거북선에는 조선식 미사일인 신기전이 장착되어 있어서 미사일을 이용해 일본군을 공격하였다.",
          false_basis: "거북선에 신기전을 장착했다는 근거가 없다.",
          level_fit_reason: "현대 미사일 개념을 섞은 Level 4 오류다.",
          student_answer: "거북선은 노와 돛으로 움직였고 신기전을 장착해 일본군을 공격했어.",
          false_claims: [{
            claim: "거북선에는 조선식 미사일인 신기전이 장착되어 있어서 미사일을 이용해 일본군을 공격하였다.",
            why_false: "거북선에 신기전을 장착했다는 근거가 없다.",
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

test("조선의 일본 침략 대응 질문은 임진왜란 대응 기준선과 전체 거짓 전제를 사용한다", async () => {
  const fetchCalls = [];
  await generateAuditedAnswer({
    message: "조선은 일본의 침략에 어떻게 대응했어?",
    level: 5,
    persona: "역사 도우미",
    turnIndex: 10,
    recentMessages: [
      { role: "student", text: "의병은 누가 조직했어?" },
      { role: "assistant", text: "의병은 전쟁이 끝난 뒤 처음 조직되었어." }
    ],
    recentFalseClaims: [
      {
        topicId: "uibyong",
        topic: "의병",
        falseClaim: "의병은 전국에서 활약했으며 대부분 국가의 지원을 받아 조직되었다.",
        whyFalse: "의병은 지역에서 자발적으로 조직된 경우가 많았다.",
        level: 1
      },
      {
        topicId: "seonjo-trust",
        topic: "선조와 이순신",
        falseClaim: "선조는 전쟁 내내 이순신 장군을 적극적으로 신뢰하고 지원하였다.",
        whyFalse: "파직과 투옥이 있었다.",
        level: 2
      }
    ],
    env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "gpt-test" },
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url, init });
      return jsonResponse({
        output_text: JSON.stringify({
          correct_answer: "조선은 관군과 수군, 의병, 명군의 지원으로 대응했다.",
          false_answer: "조선은 일본의 침략에 대응하면서 전쟁이 끝난 뒤에야 처음 의병을 조직해 지역 치안을 맡겼다.",
          false_basis: "의병 조직 시점을 전쟁 뒤로 바꾼 오류다.",
          level_fit_reason: "조직 시점을 바꾼 사실 오류다.",
          student_answer: "조선은 수군과 관군을 재정비했고, 전쟁이 끝난 뒤에는 의병을 처음 조직해 지역 치안을 맡겼어.",
          false_claims: [{
            claim: "의병은 전쟁이 끝난 뒤 처음 조직되었어.",
            why_false: "의병은 전쟁 중 조직되어 활동했다.",
            level_fit_reason: "시점을 바꾼 사실 오류다."
          }],
          suggested_questions: ["수군은 어떤 역할을 했어?", "관군은 어떻게 싸웠어?", "명나라는 왜 참전했어?"]
        })
      });
    }
  });

  const prompt = JSON.parse(fetchCalls[0].init.body).input[1].content;
  assert.match(prompt, /Historical topic seed: 임진왜란 당시 조선의 대응/);
  assert.match(prompt, /의병은 전국에서 활약했으며 대부분 국가의 지원을 받아 조직되었다/);
  assert.match(prompt, /선조는 전쟁 내내 이순신 장군을 적극적으로 신뢰하고 지원하였다/);
  assert.doesNotMatch(prompt, /Historical topic seed: 고려와 몽골의 전쟁/);
  assert.doesNotMatch(prompt, /Historical topic seed: 훈민정음 창제/);
});

test("LLM 응답이 검수를 실패하면 일반 생성 뒤 repair 생성까지 수행하고 fail-closed한다", async () => {
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

  assert.equal(calls, 5);
  assert.equal(result.shouldSendToStudent, false);
  assert.equal(result.audit.preflight.verdict, "FAIL_CLOSED_AFTER_RETRIES");
  assert.equal(result.audit.provider.timeoutMs, 2500);
  assert.ok(result.audit.selectedCase.verificationPrompt.includes("임진왜란"));
  assert.ok(result.audit.selectedCase.debriefNote.includes("정정"));
  assert.ok(result.answer.includes("다시"));
});

test("독립 LLM verifier가 거절하면 일반 생성 뒤 repair 생성까지 검수한다", async () => {
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
          false_basis: "승리에는 조류, 지형, 전술과 병사들의 역할도 함께 작용했다.",
          level_fit_reason: "여러 승리 요인을 하나로 줄인 Level 2 과장이다.",
          student_answer: "명량해전은 배가 적었지만 사실상 이순신의 지휘력 하나만으로 이겼다고 볼 수 있어."
        })
      });
    }
  });

  assert.equal(fetchCalls.length, 10);
  assert.deepEqual(fetchCalls.map(({ init }) => requestSchemaName(init)), [
    "misinfo_audit",
    "misinfo_preflight_verifier",
    "misinfo_audit",
    "misinfo_preflight_verifier",
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
  assert.equal(result.audit.preflight.failures.length, 5);
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
            false_answer: "이순신 장군은 모든 해전을 거북선을 중심으로 지휘하였다.",
            false_basis: "판옥선이 주력이었고 거북선이 모든 해전의 중심은 아니었다.",
            level_fit_reason: "일부 활용을 모든 해전으로 확대한 Level 2 과장이다.",
            student_answer: "명량해전의 조선 배는 적었고, 이순신은 모든 해전을 거북선을 중심으로 지휘했어."
          })
        });
      }
    });

    assert.equal(result.shouldSendToStudent, false, JSON.stringify(rejectedFlag));
    assert.equal(result.audit.preflight.verdict, "FAIL_CLOSED_AFTER_RETRIES");
  }
});

test("독립 LLM verifier가 승인 seed 보존을 거절하면 repair 생성까지 수행한다", async () => {
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
          false_answer: "거북선은 조선 수군 승리의 가장 결정적인 무기였다.",
          false_basis: "승리에는 판옥선, 화포, 지형, 전술과 병사들의 역할이 함께 작용했다.",
          level_fit_reason: "한 무기의 기여를 가장 결정적인 원인으로 확대한 Level 2 과장이다.",
          student_answer: "명량해전에는 여러 승리 요인이 있었지만, 거북선이 조선 수군 승리의 가장 결정적인 무기였어."
        })
      });
    }
  });

  assert.equal(fetchCalls.length, 10);
  assert.equal(result.shouldSendToStudent, false);
  assert.equal(result.audit.preflight.verdict, "FAIL_CLOSED_AFTER_RETRIES");
  assert.equal(result.audit.preflight.failures.length, 5);
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
      false_basis: "명량해전의 조선 수군 전력을 약 21척으로 보는 것은 맞지 않는다.",
      level_fit_reason: "핵심 수량 하나를 바꾼 사실 오류다.",
      student_answer: "명량해전에서는 조선 수군이 약 21척의 판옥선을 중심으로 싸웠어."
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
      false_answer: "난중일기는 전쟁 상황을 조정에 보고하기 위해 작성한 공식 군사 기록이다. 난중일기는 조선 수군의 공식 작전 일지 역할을 했다.",
      false_basis: "난중일기는 공식 보고서가 아니라 이순신의 개인 일기다.",
      level_fit_reason: "개인 기록을 공식 군사 기록으로 바꾼 오류다.",
      student_answer: "난중일기는 조정 보고용 공식 군사 기록이자 조선 수군의 공식 작전 일지였어."
    },
    message: "난중일기는 어떤 기록이야?",
    level: 4,
    persona: "역사 도우미",
    turnIndex: 3,
    attempt: 1,
    model: "gpt-test"
  });

  assert.equal(audit.preflight.approvedForStudent, false);
  assert.equal(audit.preflight.checks.calibrationSeedPreserved, false);
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
  assert.equal(audit.preflight.checks.falseClaimAllowlisted, false);
  assert.equal(audit.preflight.verdict, "FAIL_REGENERATE_BEFORE_STUDENT");
});

test("normalizeTimeoutMs는 운영 설정을 안전 범위로 제한한다", () => {
  assert.equal(normalizeTimeoutMs("4321"), 4321);
  assert.equal(normalizeTimeoutMs(0), 1000);
  assert.equal(normalizeTimeoutMs("999"), 1000);
  assert.equal(normalizeTimeoutMs("70000"), 60000);
  assert.equal(normalizeTimeoutMs("not-a-number"), 15000);
});

test("동적 거짓 밀도는 질문 범위에 따라 1~2개를 선택하며 0개를 허용하지 않는다", () => {
  assert.equal(resolveFalseClaimTarget({ falseDensity: "dynamic", message: "거북선은 뭐야?", turnIndex: 0 }), 1);
  assert.equal(resolveFalseClaimTarget({ falseDensity: "dynamic", message: "거북선은 왜 중요했어?", turnIndex: 0 }), 1);
  assert.equal(resolveFalseClaimTarget({ falseDensity: "dynamic", message: "임진왜란 전체 과정과 결과를 비교해줘", turnIndex: 0 }), 2);
  assert.equal(resolveFalseClaimTarget({ falseDensity: "single", message: "아무 질문", turnIndex: 0 }), 1);
});

test("전체 거짓 밀도는 모든 역사 주장이 거짓이라는 독립 검수를 통과해야 한다", () => {
  const seed = "거북선에는 조선식 미사일인 신기전이 장착되어 있어서 미사일을 이용해 일본군을 공격하였다.";
  const secondSeed = "거북선은 철판으로 완전히 덮여 있어 총알과 화살이 전혀 통하지 않았다.";
  const audit = normalizeLlmAudit({
    draft: {
      correct_answer: "거북선은 조선 수군이 개량하고 운용한 전투선이며 신기전 장착이나 완전 방어를 뒷받침하는 근거는 없다.",
      false_answer: seed,
      false_basis: "거북선에 신기전을 장착했다는 근거가 없다.",
      level_fit_reason: "현대 미사일 개념을 섞은 Level 4 환각이다.",
      student_answer: `${seed} ${secondSeed}`,
      false_claims: [
        {
          claim: seed,
          why_false: "신기전 장착 근거가 없다.",
          level_fit_reason: "Level 4 시대착오다."
        },
        {
          claim: secondSeed,
          why_false: "철판 완전 피복과 완전 방어를 입증하는 근거가 없다.",
          level_fit_reason: "방어 구조를 완전 방어로 과장했다."
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
  const seed = "이순신 장군은 거북선을 직접 설계하고 발명하였다.";
  const audit = normalizeLlmAudit({
    draft: {
      correct_answer: "거북선은 이전 기록이 있으며 이순신과 조선 수군이 개량하고 운용했다.",
      false_answer: seed,
      false_basis: "이순신 개인이 처음부터 직접 발명한 배로 단정할 수 없다.",
      level_fit_reason: "개량과 운용의 역할을 개인 발명으로 확대한 오류다.",
      student_answer: `거북선은 조선 수군이 해전에서 활용한 전투선이야. ${seed}`,
      false_claims: [
        {
          claim: seed,
          why_false: "이순신 개인의 직접 발명으로 단정할 수 없다.",
          level_fit_reason: "Level 2 인물 중심 과장이다."
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

test("허용 목록 밖의 새 거짓 주장은 학생 전송 전에 차단한다", () => {
  const seed = "거북선은 조선 수군의 주력 군함이었다.";
  const audit = normalizeLlmAudit({
    draft: {
      correct_answer: "조선 수군의 주력 군함은 판옥선이었다.",
      false_answer: seed,
      false_basis: "거북선보다 판옥선이 주력 군함이었다.",
      level_fit_reason: "보조 전투선을 주력 군함으로 확대한 과장이다.",
      student_answer: `${seed} 거북선은 바닷속 음파 탐지 장치도 사용했어.`,
      false_claims: [{
        claim: "거북선은 바닷속 음파 탐지 장치도 사용했다.",
        why_false: "당시 존재하지 않은 장치다.",
        level_fit_reason: "목록에 없는 시대착오적 거짓이다."
      }],
      suggested_questions: ["판옥선과 무엇이 달라?", "어느 해전에 나왔어?", "몇 척이 사용됐어?"]
    },
    message: "거북선은 조선 수군의 주력 배였어?",
    level: 2,
    persona: "친근한 역사 도우미",
    falseDensity: "single",
    turnIndex: 0,
    attempt: 1,
    model: "gpt-test"
  });

  assert.equal(audit.preflight.approvedForStudent, false);
  assert.equal(audit.preflight.checks.falseClaimsAllowlisted, false);
});

test("독립 검수기가 목록 밖 거짓을 감지하면 로컬 검수를 통과해도 차단한다", () => {
  const seed = "거북선은 조선 수군의 주력 군함이었다.";
  const audit = normalizeLlmAudit({
    draft: {
      correct_answer: "조선 수군의 주력 군함은 판옥선이었다.",
      false_answer: seed,
      false_basis: "거북선보다 판옥선이 주력 군함이었다.",
      level_fit_reason: "보조 전투선을 주력 군함으로 확대한 과장이다.",
      student_answer: seed,
      false_claims: [{
        claim: seed,
        why_false: "판옥선이 주력 군함이었다.",
        level_fit_reason: "Level 2 범위 확대다."
      }],
      suggested_questions: ["판옥선과 무엇이 달라?", "어느 해전에 나왔어?", "몇 척이 사용됐어?"]
    },
    message: "거북선은 조선 수군의 주력 배였어?",
    level: 2,
    persona: "친근한 역사 도우미",
    falseDensity: "single",
    turnIndex: 0,
    attempt: 1,
    model: "gpt-test"
  });
  const rejected = applyVerifierVerdict({
    audit,
    model: "gpt-verifier",
    draft: {
      ...approvedVerifier(),
      approved: false,
      only_approved_falsehoods: false
    }
  });

  assert.equal(audit.preflight.approvedForStudent, true);
  assert.equal(rejected.preflight.approvedForStudent, false);
  assert.equal(rejected.preflight.checks.verifierOnlyApprovedFalsehoods, false);
});

test("독립 검수기가 질문과 무관한 문단이나 역사 주장을 감지하면 차단한다", () => {
  const seed = "거북선은 조선 수군의 주력 군함이었다.";
  const audit = normalizeLlmAudit({
    draft: {
      correct_answer: "조선 수군의 주력 군함은 판옥선이었다.",
      false_answer: seed,
      false_basis: "거북선보다 판옥선이 주력 군함이었다.",
      level_fit_reason: "보조 전투선을 주력 군함으로 확대한 과장이다.",
      student_answer: seed,
      false_claims: [{
        claim: seed,
        why_false: "판옥선이 주력 군함이었다.",
        level_fit_reason: "Level 2 범위 확대다."
      }],
      suggested_questions: ["판옥선과 무엇이 달라?", "어느 해전에 나왔어?", "몇 척이 사용됐어?"]
    },
    message: "거북선은 조선 수군의 주력 배였어?",
    level: 2,
    persona: "친근한 역사 도우미",
    falseDensity: "single",
    turnIndex: 0,
    attempt: 1,
    model: "gpt-test"
  });
  const rejected = applyVerifierVerdict({
    audit,
    model: "gpt-verifier",
    draft: {
      ...approvedVerifier(),
      approved: false,
      question_relevant: false,
      rationale: "학생 질문과 무관한 역사 설명이 별도 문단에 포함됐다."
    }
  });

  assert.equal(audit.preflight.approvedForStudent, true);
  assert.equal(rejected.preflight.approvedForStudent, false);
  assert.equal(rejected.preflight.checks.verifierQuestionRelevant, false);
});

test("철칙 DB 밖의 역사 질문은 질문별 Combination 거짓을 독립 검수 대상으로 허용한다", () => {
  const falseClaim = "발해는 거란의 공격 한 번만으로 갑자기 멸망했다.";
  const audit = normalizeLlmAudit({
    draft: {
      correct_answer: "발해는 거란의 공격과 내부 약화 등 여러 요인이 겹치며 멸망했다.",
      false_answer: falseClaim,
      false_basis: "복합적인 멸망 원인을 단일 공격으로 줄였다.",
      level_fit_reason: "여러 원인을 하나로 줄인 Level 2 단순화다.",
      student_answer: "발해는 거란의 공격 한 번만으로 갑자기 멸망했어.",
      false_claims: [{
        claim: falseClaim,
        why_false: "복합적인 멸망 원인을 단일 공격으로 줄였다.",
        level_fit_reason: "Level 2 원인 단순화다."
      }]
    },
    message: "발해는 왜 멸망했어?",
    level: 2,
    persona: "친근한 역사 도우미",
    falseDensity: "single",
    turnIndex: 0,
    attempt: 1,
    model: "gpt-test"
  });
  const verified = applyVerifierVerdict({
    audit,
    model: "gpt-verifier",
    draft: approvedVerifier()
  });

  assert.equal(audit.selectedCase.id, "general-history");
  assert.equal(audit.input.generatedCombinationMode, true);
  assert.deepEqual(audit.input.approvedFalsehoods, []);
  assert.equal(audit.preflight.approvedForStudent, true);
  assert.equal(verified.preflight.approvedForStudent, true);
});

test("하드 검수를 통과한 답변은 품질 경고만으로 5회 모두 폐기하지 않는다", async () => {
  let calls = 0;
  const falseClaim = "발해는 거란의 공격 한 번만으로 갑자기 멸망했다.";
  const result = await generateAuditedAnswer({
    message: "발해는 왜 멸망했어?",
    level: 2,
    persona: "역사 도우미",
    falseDensity: "single",
    env: {
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-generator",
      OPENAI_VERIFIER_MODEL: "gpt-verifier",
      STRICT_DB_FAST_PATH: "false"
    },
    fetchImpl: async (url, init) => {
      calls += 1;
      if (requestSchemaName(init) === "misinfo_preflight_verifier") {
        return jsonResponse({
          output_text: JSON.stringify({
            ...approvedVerifier(),
            approved: false,
            non_repetitive: false,
            rationale: "내용은 안전하지만 표현 품질 개선이 필요하다."
          })
        });
      }
      return jsonResponse({
        output_text: JSON.stringify({
          correct_answer: "발해는 거란의 공격과 내부 약화 등 여러 요인이 겹치며 멸망했다.",
          false_answer: falseClaim,
          false_basis: "복합적인 멸망 원인을 단일 공격으로 줄였다.",
          level_fit_reason: "여러 원인을 하나로 줄인 Level 2 단순화다.",
          student_answer: "발해는 거란의 공격 한 번만으로 갑자기 멸망했어.",
          false_claims: [{
            claim: falseClaim,
            why_false: "복합적인 멸망 원인을 단일 공격으로 줄였다.",
            level_fit_reason: "Level 2 원인 단순화다."
          }]
        })
      });
    }
  });

  assert.equal(calls, 4);
  assert.equal(result.shouldSendToStudent, true);
  assert.equal(result.audit.preflight.verdict, "PASS_HARD_GATES_WITH_QUALITY_WARNING");
  assert.deepEqual(result.audit.preflight.qualityWarning.failedChecks, [
    "non_repetitive",
    "declared_approval"
  ]);
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
    only_approved_falsehoods: true,
    question_relevant: true,
    rationale: "교사용 기준 정답과 일치하고, 진실 맥락에 Level 오류가 섞였으며 정정 누출이 없다."
  };
}
