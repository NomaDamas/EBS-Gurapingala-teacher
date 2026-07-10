export const studentHtml = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>질문의 온도</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Gowun+Dodum&family=Song+Myung&display=swap" rel="stylesheet">
  <style>
    :root {
      --ink: #1f2320;
      --paper: #f7f1df;
      --accent: #a94724;
      --moss: #596b3d;
      --line: rgba(31, 35, 32, .16);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--ink);
      font-family: "Gowun Dodum", sans-serif;
      background:
        radial-gradient(circle at 12% 15%, rgba(169, 71, 36, .18), transparent 26rem),
        radial-gradient(circle at 85% 10%, rgba(89, 107, 61, .20), transparent 24rem),
        linear-gradient(135deg, #f7f1df 0%, #eadbb7 100%);
    }
    main {
      display: grid;
      grid-template-rows: auto 1fr auto;
      max-width: 920px;
      min-height: 100vh;
      margin: 0 auto;
      padding: 28px 18px;
      gap: 18px;
    }
    header {
      border: 1px solid var(--line);
      border-radius: 28px;
      padding: 22px;
      background: rgba(255, 252, 239, .74);
      backdrop-filter: blur(14px);
      box-shadow: 0 24px 80px rgba(69, 48, 23, .12);
    }
    h1 {
      margin: 0 0 8px;
      font-family: "Song Myung", serif;
      font-size: clamp(34px, 7vw, 68px);
      line-height: .9;
      letter-spacing: -.05em;
    }
    .sub { max-width: 680px; color: rgba(31, 35, 32, .72); }
    .notice {
      margin-top: 12px;
      padding: 10px 12px;
      border: 1px dashed rgba(31, 35, 32, .22);
      border-radius: 16px;
      background: rgba(255, 250, 240, .58);
      color: rgba(31, 35, 32, .70);
      font-size: 13px;
    }
    .join, .composer, .message, .panel {
      border: 1px solid var(--line);
      border-radius: 24px;
      background: rgba(255, 252, 239, .82);
      box-shadow: 0 18px 50px rgba(69, 48, 23, .10);
    }
    .join { padding: 18px; display: grid; grid-template-columns: 1fr auto; gap: 12px; }
    input, select, textarea, button {
      font: inherit;
      border-radius: 16px;
      border: 1px solid var(--line);
      padding: 13px 14px;
      color: var(--ink);
      background: #fffaf0;
    }
    button {
      border: 0;
      background: var(--ink);
      color: #fffaf0;
      cursor: pointer;
      font-weight: 700;
    }
    button.secondary { background: var(--moss); }
    #chat {
      min-height: 360px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      overflow: auto;
      padding: 4px;
    }
    .message {
      max-width: 82%;
      padding: 15px 17px;
      white-space: pre-wrap;
      animation: rise .22s ease-out both;
    }
    .me { align-self: flex-end; background: #1f2320; color: #fffaf0; }
    .bot { align-self: flex-start; border-left: 5px solid var(--accent); }
    .composer { display: grid; grid-template-columns: 1fr auto; gap: 12px; padding: 12px; }
    textarea { resize: none; min-height: 58px; }
    .hidden { display: none; }
    .toolbar { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
    .pill { border: 1px solid var(--line); border-radius: 999px; padding: 8px 11px; background: rgba(255,255,255,.45); }
    @keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    @media (max-width: 640px) {
      .join, .composer { grid-template-columns: 1fr; }
      .message { max-width: 96%; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>질문의 온도</h1>
      <p class="sub">이순신 장군 AI 챗봇과 대화하면서, 임진왜란 당시 조선이 일본군의 침략을 막아낼 수 있었던 이유를 정리해봅시다.</p>
      <p class="notice">수업 활동 관찰을 위해 이름, 질문, 답변, 접속 상태가 교사용 대시보드에 기록됩니다. 이름 외 개인정보는 입력하지 마세요.</p>
      <div class="toolbar">
        <span class="pill" id="status">입장 전</span>
        <span class="pill" id="roomStatus">room: default-classroom</span>
        <span class="pill">교과서, 검색, 친구 토론을 함께 사용할 수 있어요</span>
      </div>
    </header>
    <section class="join" id="join">
      <input id="name" placeholder="이름을 입력하세요" autocomplete="name" />
      <button id="joinBtn">바로 시작</button>
    </section>
    <section id="chat" aria-live="polite"></section>
    <form class="composer hidden" id="form">
      <textarea id="message" placeholder="예: 명량해전에서 조선이 이긴 이유가 뭐야?"></textarea>
      <button>묻기</button>
    </form>
  </main>
  <script>
    const chat = document.querySelector("#chat");
    const form = document.querySelector("#form");
    const join = document.querySelector("#join");
    const joinBtn = document.querySelector("#joinBtn");
    const status = document.querySelector("#status");
    const roomStatus = document.querySelector("#roomStatus");
    const nameInput = document.querySelector("#name");
    const messageInput = document.querySelector("#message");
    const params = new URLSearchParams(location.search);
    const roomId = normalizeRoomId(params.get("room") || "default-classroom");
    const sessionKey = "ebs-session-id:" + roomId;
    const sessionSecretKey = "ebs-session-secret:" + roomId;
    const studentNameKey = "ebs-student-name:" + roomId;
    roomStatus.textContent = "room: " + roomId;
    let sessionId = localStorage.getItem(sessionKey) || crypto.randomUUID();
    let sessionSecret = localStorage.getItem(sessionSecretKey) || crypto.randomUUID();
    let studentName = localStorage.getItem(studentNameKey) || "";
    let heartbeatTimer = null;
    let joining = false;
    localStorage.setItem(sessionKey, sessionId);
    localStorage.setItem(sessionSecretKey, sessionSecret);
    nameInput.value = studentName;

    function addMessage(role, text) {
      const el = document.createElement("article");
      el.className = "message " + (role === "me" ? "me" : "bot");
      el.textContent = text;
      chat.appendChild(el);
      el.scrollIntoView({ behavior: "smooth", block: "end" });
    }

    async function joinClass() {
      if (joining) return;
      const nextStudentName = nameInput.value.trim();
      if (!nextStudentName) return nameInput.focus();
      joining = true;
      joinBtn.disabled = true;
      status.textContent = "입장 중";
      try {
        const res = await fetch(withRoom("/api/join"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId, sessionSecret, studentName: nextStudentName })
        });
        const data = await readJsonSafely(res);
        if (!res.ok) {
          status.textContent = data.message || data.error || "입장 실패";
          return;
        }
        studentName = nextStudentName;
        localStorage.setItem(studentNameKey, studentName);
        sendHeartbeat();
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(sendHeartbeat, 15000);
        join.classList.add("hidden");
        form.classList.remove("hidden");
        status.textContent = studentName + " online";
        addMessage("bot", "안녕. 임진왜란과 이순신 장군에 대해 궁금한 점을 물어봐.");
      } catch (error) {
        status.textContent = "입장 실패: 네트워크를 확인해 주세요";
      } finally {
        joining = false;
        joinBtn.disabled = false;
      }
    }

    function sendHeartbeat() {
      if (!studentName) return;
      fetch(withRoom("/api/heartbeat"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, sessionSecret, studentName })
      }).catch(() => {});
    }

    joinBtn.addEventListener("click", joinClass);
    nameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") joinClass();
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const message = messageInput.value.trim();
      if (!message) return;
      messageInput.value = "";
      addMessage("me", message);
      try {
        const res = await fetch(withRoom("/api/chat"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId, sessionSecret, studentName, message })
        });
        const data = await readJsonSafely(res);
        if (!res.ok) {
          addMessage("bot", studentErrorMessage(res, data));
          return;
        }
        addMessage("bot", data.answer);
      } catch (error) {
        addMessage("bot", "네트워크 문제로 답변을 받지 못했어. 연결을 확인한 뒤 다시 물어봐.");
      }
    });

    async function readJsonSafely(res) {
      try {
        return await res.json();
      } catch (error) {
        return {};
      }
    }

    function studentErrorMessage(res, data) {
      if (res.status === 429 || data.error === "rate_limited") {
        const retrySeconds = Math.ceil(Number(data.retryAfterMs || 0) / 1000);
        return retrySeconds > 0
          ? retrySeconds + "초 뒤에 다시 물어봐."
          : "질문이 너무 빠르게 이어졌어. 잠시 후 다시 물어봐.";
      }
      return data.message || data.error || "질문을 처리하지 못했어. 다시 입력해줘.";
    }

    function withRoom(path) {
      return path + "?room=" + encodeURIComponent(roomId);
    }

    function normalizeRoomId(value) {
      return String(value || "default-classroom")
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "default-classroom";
    }
  </script>
</body>
</html>`;
