export const teacherHtml = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>교사용 실시간 대시보드</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Gowun+Dodum&family=Song+Myung&display=swap" rel="stylesheet">
  <style>
    :root {
      --ink: #18201c;
      --paper: #f4ecd7;
      --card: rgba(255, 252, 239, .86);
      --accent: #b64b2b;
      --green: #4f6f38;
      --line: rgba(24, 32, 28, .16);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      font-family: "Gowun Dodum", sans-serif;
      background:
        linear-gradient(90deg, rgba(24,32,28,.05) 1px, transparent 1px),
        linear-gradient(0deg, rgba(24,32,28,.05) 1px, transparent 1px),
        radial-gradient(circle at 80% 0%, rgba(182, 75, 43, .16), transparent 24rem),
        var(--paper);
      background-size: 34px 34px, 34px 34px, auto, auto;
    }
    main {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 340px 1fr;
      gap: 18px;
      padding: 18px;
    }
    aside, section, header, pre, .student {
      border: 1px solid var(--line);
      border-radius: 24px;
      background: var(--card);
      box-shadow: 0 20px 55px rgba(70, 52, 24, .10);
    }
    aside { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
    header { padding: 18px; }
    h1 {
      font-family: "Song Myung", serif;
      font-size: clamp(32px, 4vw, 54px);
      margin: 0;
      letter-spacing: -.05em;
    }
    .controls { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
    label { display: grid; gap: 6px; font-size: 13px; color: rgba(24,32,28,.66); }
    input, select, textarea, button {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 11px;
      font: inherit;
      background: #fffaf0;
      color: var(--ink);
    }
    button {
      width: auto;
      border: 0;
      background: var(--ink);
      color: #fffaf0;
      cursor: pointer;
      font-weight: 700;
    }
    button.secondary { background: var(--accent); }
    textarea { min-height: 74px; resize: vertical; }
    .student {
      padding: 13px;
      cursor: pointer;
      display: grid;
      gap: 4px;
    }
    .student.active { outline: 3px solid rgba(182,75,43,.24); }
    .dot {
      width: 10px;
      height: 10px;
      display: inline-block;
      border-radius: 50%;
      background: var(--green);
      box-shadow: 0 0 0 5px rgba(79,111,56,.14);
      margin-right: 8px;
    }
    .dot.offline {
      background: #9b9a91;
      box-shadow: 0 0 0 5px rgba(155,154,145,.16);
    }
    .layout { display: grid; grid-template-rows: auto 1fr; gap: 18px; min-width: 0; }
    .panes { display: grid; grid-template-columns: minmax(0, 1fr) minmax(360px, .85fr); gap: 18px; min-height: 0; }
    #chat, #audit { padding: 16px; overflow: auto; }
    .bubble { border-radius: 18px; padding: 12px 14px; margin: 10px 0; max-width: 78%; white-space: pre-wrap; }
    .studentMsg { background: #1f2320; color: #fffaf0; margin-left: auto; }
    .botMsg { background: #fffaf0; border-left: 5px solid var(--accent); }
    pre {
      margin: 0;
      padding: 16px;
      white-space: pre-wrap;
      font-size: 12px;
      line-height: 1.55;
    }
    .empty { color: rgba(24,32,28,.58); padding: 20px; }
    @media (max-width: 980px) {
      main, .panes { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <aside>
      <strong>학생 카드</strong>
      <div id="students"></div>
    </aside>
    <div class="layout">
      <header>
        <h1>실시간 교실 관찰</h1>
        <div class="controls">
          <label>거짓 Level
            <select id="level">
              <option value="1">Level 1 사실 오류</option>
              <option value="2" selected>Level 2 과장·단순화</option>
              <option value="3">Level 3 관점 왜곡</option>
              <option value="4">Level 4 AI 환각</option>
            </select>
          </label>
          <label>연결 상태
            <input id="socketStatus" value="connecting" readonly />
          </label>
        </div>
        <label style="margin-top:10px">페르소나 시스템 프롬프트
          <textarea id="persona">이순신 장군처럼 말하되, 학생에게 친절한 역사 수업 도우미처럼 답한다.</textarea>
        </label>
        <div class="actions">
          <button id="downloadExport">전체 로그 JSON</button>
          <button class="secondary" id="downloadDebrief">정정 수업 오류표</button>
          <button class="secondary" id="downloadDebriefCsv">오류표 CSV</button>
          <button class="secondary" id="purgeEvents">촬영 로그 삭제</button>
        </div>
      </header>
      <div class="panes">
        <section id="chat"><div class="empty">학생 카드를 클릭하면 대화가 표시됩니다.</div></section>
        <section><pre id="audit">교사용 감사 JSON 대기 중</pre></section>
      </div>
    </div>
  </main>
  <script>
    const studentsEl = document.querySelector("#students");
    const chatEl = document.querySelector("#chat");
    const auditEl = document.querySelector("#audit");
    const statusEl = document.querySelector("#socketStatus");
    const levelEl = document.querySelector("#level");
    const personaEl = document.querySelector("#persona");
    const downloadExportEl = document.querySelector("#downloadExport");
    const downloadDebriefEl = document.querySelector("#downloadDebrief");
    const downloadDebriefCsvEl = document.querySelector("#downloadDebriefCsv");
    const purgeEventsEl = document.querySelector("#purgeEvents");
    const sessions = new Map();
    const params = new URLSearchParams(location.search);
    const teacherToken = params.get("token") || localStorage.getItem("teacher-token") || "";
    if (params.get("token")) localStorage.setItem("teacher-token", params.get("token"));
    let selected = null;

    function connect() {
      const tokenQuery = teacherToken ? "?token=" + encodeURIComponent(teacherToken) : "";
      const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws/teacher" + tokenQuery);
      ws.addEventListener("open", () => {
        statusEl.value = "online";
        ws.send(JSON.stringify({ type: "teacher_config", level: levelEl.value, persona: personaEl.value }));
      });
      ws.addEventListener("close", () => {
        statusEl.value = "offline - reconnecting";
        setTimeout(connect, 1200);
      });
      ws.addEventListener("message", (event) => handleTelemetry(JSON.parse(event.data)));
      levelEl.addEventListener("change", () => ws.readyState === 1 && ws.send(JSON.stringify({ type: "teacher_config", level: levelEl.value, persona: personaEl.value })));
      personaEl.addEventListener("change", () => ws.readyState === 1 && ws.send(JSON.stringify({ type: "teacher_config", level: levelEl.value, persona: personaEl.value })));
    }

    function handleTelemetry(event) {
      if (event.type === "snapshot") {
        for (const item of event.events || []) handleTelemetry(item);
        return;
      }
      if (!event.sessionId) return;
      const current = sessions.get(event.sessionId) || { messages: [], name: event.studentName || "이름 없음", online: true };
      current.name = event.studentName || current.name;
      current.lastSeenMs = event.at ? Date.parse(event.at) : Date.now();
      current.online = Date.now() - current.lastSeenMs < 35000;
      current.lastEvent = event.type;
      current.updatedAt = new Date().toLocaleTimeString();
      if (event.type === "chat_turn") {
        current.messages.push({ role: "student", text: event.studentMessage });
        current.messages.push({ role: "bot", text: event.studentVisibleAnswer });
        current.audit = event.teacherAudit;
      }
      sessions.set(event.sessionId, current);
      if (!selected) selected = event.sessionId;
      renderStudents();
      renderSelected();
    }

    function renderStudents() {
      studentsEl.innerHTML = "";
      for (const [id, session] of sessions) {
        session.online = Date.now() - (session.lastSeenMs || 0) < 35000;
        const el = document.createElement("article");
        el.className = "student" + (id === selected ? " active" : "");
        const dotClass = session.online ? "dot" : "dot offline";
        const state = session.online ? "online" : "offline";
        el.innerHTML = "<strong><span class='" + dotClass + "'></span>" + session.name + "</strong><small>" + state + " · " + session.updatedAt + " · " + session.lastEvent + "</small>";
        el.addEventListener("click", () => {
          selected = id;
          renderStudents();
          renderSelected();
        });
        studentsEl.appendChild(el);
      }
    }

    function renderSelected() {
      const session = sessions.get(selected);
      if (!session) return;
      chatEl.innerHTML = "";
      for (const message of session.messages) {
        const el = document.createElement("div");
        el.className = "bubble " + (message.role === "student" ? "studentMsg" : "botMsg");
        el.textContent = message.text;
        chatEl.appendChild(el);
      }
      auditEl.textContent = session.audit ? JSON.stringify(session.audit, null, 2) : "입장 이벤트만 수신됨";
    }

    async function downloadJson(path, filename) {
      const res = await fetch(path, { headers: authHeaders() });
      if (!res.ok) return alert("다운로드 권한을 확인하세요.");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    }

    async function downloadText(path, filename, type) {
      const res = await fetch(path, { headers: authHeaders() });
      if (!res.ok) return alert("다운로드 권한을 확인하세요.");
      const text = await res.text();
      const blob = new Blob([text], { type });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    }

    async function purgeEvents() {
      if (!confirm("촬영 로그를 삭제할까요? export 후 삭제하는 것을 권장합니다.")) return;
      const res = await fetch("/api/purge", { method: "POST", headers: authHeaders() });
      if (!res.ok) return alert("삭제 권한을 확인하세요.");
      sessions.clear();
      selected = null;
      renderStudents();
      chatEl.innerHTML = "<div class='empty'>촬영 로그가 삭제되었습니다.</div>";
      auditEl.textContent = "교사용 감사 JSON 대기 중";
    }

    function authHeaders() {
      return teacherToken ? { "x-teacher-token": teacherToken } : {};
    }

    connect();
    setInterval(renderStudents, 5000);
    downloadExportEl.addEventListener("click", () => downloadJson("/api/export", "classroom-export.json"));
    downloadDebriefEl.addEventListener("click", () => downloadJson("/api/debrief", "debrief-table.json"));
    downloadDebriefCsvEl.addEventListener("click", () => downloadText("/api/debrief.csv", "debrief-table.csv", "text/csv"));
    purgeEventsEl.addEventListener("click", purgeEvents);
  </script>
</body>
</html>`;
