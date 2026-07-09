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
    .classSummary {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      padding: 10px;
      border-radius: 18px;
      background: rgba(255, 250, 240, .72);
      border: 1px solid var(--line);
    }
    .classSummary span { display: grid; gap: 2px; font-size: 12px; color: rgba(24,32,28,.62); }
    .classSummary strong { font-size: 20px; color: var(--ink); }
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
    .blockedMsg { border-left-color: #8a3324; background: #fff1e6; }
    .flag {
      display: inline-block;
      margin-left: 6px;
      border-radius: 999px;
      padding: 2px 7px;
      background: rgba(182, 75, 43, .14);
      color: #8a3324;
      font-size: 11px;
      font-weight: 700;
    }
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
      <div class="classSummary" id="classSummary">
        <span>전체<strong>0</strong></span>
        <span>온라인<strong>0</strong></span>
        <span>채팅턴<strong>0</strong></span>
      </div>
      <div id="students"></div>
    </aside>
    <div class="layout">
      <header>
        <h1>실시간 교실 관찰</h1>
        <p id="roomStatus">room: default-classroom</p>
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
          <label>설정 적용 상태
            <input id="configStatus" value="server sync 대기" readonly />
          </label>
        </div>
        <div class="actions">
          <button id="reconnectSocket">실시간 연결 재시도</button>
          <button id="copyStudentUrl">학생 URL 복사</button>
          <button id="copyTeacherUrl">교사용 URL 복사</button>
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
    const classSummaryEl = document.querySelector("#classSummary");
    const chatEl = document.querySelector("#chat");
    const auditEl = document.querySelector("#audit");
    const statusEl = document.querySelector("#socketStatus");
    const configStatusEl = document.querySelector("#configStatus");
    const roomStatusEl = document.querySelector("#roomStatus");
    const levelEl = document.querySelector("#level");
    const personaEl = document.querySelector("#persona");
    const downloadExportEl = document.querySelector("#downloadExport");
    const downloadDebriefEl = document.querySelector("#downloadDebrief");
    const downloadDebriefCsvEl = document.querySelector("#downloadDebriefCsv");
    const purgeEventsEl = document.querySelector("#purgeEvents");
    const reconnectSocketEl = document.querySelector("#reconnectSocket");
    const copyStudentUrlEl = document.querySelector("#copyStudentUrl");
    const copyTeacherUrlEl = document.querySelector("#copyTeacherUrl");
    const sessions = new Map();
    const params = new URLSearchParams(location.search);
    const teacherToken = params.get("token") || localStorage.getItem("teacher-token") || "";
    const roomId = normalizeRoomId(params.get("room") || "default-classroom");
    roomStatusEl.textContent = "room: " + roomId;
    if (params.get("token")) {
      localStorage.setItem("teacher-token", params.get("token"));
      params.delete("token");
      const cleanQuery = params.toString();
      history.replaceState(null, "", location.pathname + (cleanQuery ? "?" + cleanQuery : ""));
    }
    let selected = null;
    let socket = null;
    let reconnectTimer = null;
    let reconnectAttempts = 0;
    let lastTelemetryAt = null;

    function connect(manual = false) {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        if (!manual) return;
        socket.close();
      }
      const query = new URLSearchParams({ room: roomId });
      const protocols = teacherToken ? [encodeTeacherWebSocketProtocol(teacherToken)] : [];
      const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws/teacher?" + query.toString(), protocols);
      socket = ws;
      updateSocketStatus("connecting");
      ws.addEventListener("open", () => {
        if (socket !== ws) return;
        reconnectAttempts = 0;
        updateSocketStatus("online");
      });
      ws.addEventListener("close", () => {
        if (socket !== ws) return;
        scheduleReconnect("offline");
      });
      ws.addEventListener("error", () => {
        if (socket !== ws) return;
        updateSocketStatus("socket error");
      });
      ws.addEventListener("message", (event) => {
        if (socket !== ws) return;
        lastTelemetryAt = new Date();
        updateSocketStatus("online");
        const telemetry = parseTelemetry(event.data);
        if (telemetry) handleTelemetry(telemetry);
      });
    }

    function scheduleReconnect(reason) {
      reconnectAttempts += 1;
      const delay = Math.min(10000, 1000 * reconnectAttempts);
      updateSocketStatus(reason + " - reconnect in " + Math.round(delay / 1000) + "s");
      reconnectTimer = setTimeout(() => connect(false), delay);
    }

    function updateSocketStatus(state) {
      const last = lastTelemetryAt ? " · last " + lastTelemetryAt.toLocaleTimeString() : "";
      const attempts = reconnectAttempts ? " · retry " + reconnectAttempts : "";
      statusEl.value = state + attempts + last;
    }

    async function sendTeacherConfig() {
      configStatusEl.value = "저장 중: Level " + levelEl.value;
      const payload = { type: "teacher_config", level: levelEl.value, persona: personaEl.value };
      if (socket && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify(payload));
          return;
        } catch (error) {
          updateSocketStatus("config socket failed");
        }
      }
      await postTeacherConfig(payload);
    }

    function parseTelemetry(value) {
      try {
        return JSON.parse(value);
      } catch {
        updateSocketStatus("ignored invalid telemetry");
        return null;
      }
    }

    function handleTelemetry(event) {
      if (event.type === "snapshot") {
        if (event.config) applyTeacherConfig(event.config);
        for (const item of event.events || []) handleTelemetry(item);
        return;
      }
      if (event.type === "teacher_config_updated") {
        applyTeacherConfig(event.config || event);
        auditEl.textContent = JSON.stringify({
          type: "teacher_config_updated",
          level: levelEl.value,
          persona: personaEl.value,
          at: event.at
        }, null, 2);
        return;
      }
      if (event.type === "events_purged") {
        auditEl.textContent = JSON.stringify(event, null, 2);
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
        current.messages.push({ role: "bot", text: event.studentVisibleAnswer, blockedForStudent: Boolean(event.blockedForStudent) });
        current.audit = event.teacherAudit;
        current.latencyMs = event.latencyMs;
        current.blockedForStudent = Boolean(event.blockedForStudent);
        current.chatTurns = (current.chatTurns || 0) + 1;
      }
      sessions.set(event.sessionId, current);
      if (!selected) selected = event.sessionId;
      renderStudents();
      renderSelected();
    }

    function renderStudents() {
      studentsEl.innerHTML = "";
      let onlineCount = 0;
      let chatTurns = 0;
      for (const [id, session] of sessions) {
        session.online = Date.now() - (session.lastSeenMs || 0) < 35000;
        if (session.online) onlineCount += 1;
        chatTurns += session.chatTurns || 0;
        const el = document.createElement("article");
        el.className = "student" + (id === selected ? " active" : "");
        const dotClass = session.online ? "dot" : "dot offline";
        const state = session.online ? "online" : "offline";
        const latency = Number.isFinite(session.latencyMs) ? " · " + session.latencyMs + "ms" : "";
        const title = document.createElement("strong");
        const dot = document.createElement("span");
        dot.className = dotClass;
        title.appendChild(dot);
        title.appendChild(document.createTextNode(session.name));
        if (session.blockedForStudent) {
          const blocked = document.createElement("span");
          blocked.className = "flag";
          blocked.textContent = "blocked";
          title.appendChild(blocked);
        }
        const meta = document.createElement("small");
        meta.textContent = state + " · " + session.updatedAt + " · " + session.lastEvent + latency;
        el.appendChild(title);
        el.appendChild(meta);
        el.addEventListener("click", () => {
          selected = id;
          renderStudents();
          renderSelected();
        });
        studentsEl.appendChild(el);
      }
      renderClassSummary({ total: sessions.size, online: onlineCount, chatTurns });
    }

    function renderClassSummary({ total, online, chatTurns }) {
      classSummaryEl.replaceChildren(
        summaryMetric("전체", total),
        summaryMetric("온라인", online),
        summaryMetric("채팅턴", chatTurns)
      );
    }

    function summaryMetric(label, value) {
      const item = document.createElement("span");
      const strong = document.createElement("strong");
      item.appendChild(document.createTextNode(label));
      strong.textContent = String(value);
      item.appendChild(strong);
      return item;
    }

    function renderSelected() {
      const session = sessions.get(selected);
      if (!session) return;
      chatEl.innerHTML = "";
      for (const message of session.messages) {
        const el = document.createElement("div");
        el.className = "bubble " + (message.role === "student" ? "studentMsg" : "botMsg") + (message.blockedForStudent ? " blockedMsg" : "");
        el.textContent = message.text;
        chatEl.appendChild(el);
      }
      auditEl.textContent = session.audit ? JSON.stringify(session.audit, null, 2) : "입장 이벤트만 수신됨";
    }

    function applyTeacherConfig(config) {
      if (config.level) levelEl.value = String(config.level);
      if (config.persona) personaEl.value = config.persona;
      const appliedAt = config.updatedAt ? new Date(config.updatedAt).toLocaleTimeString() : new Date().toLocaleTimeString();
      configStatusEl.value = "적용됨: Level " + levelEl.value + " · " + appliedAt;
    }

    async function downloadJson(path, filename) {
      try {
        const res = await fetch(withRoom(path), { headers: authHeaders() });
        if (!res.ok) return alert("다운로드 권한을 확인하세요.");
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        alert("네트워크 문제로 다운로드하지 못했습니다.");
      }
    }

    async function downloadText(path, filename, type) {
      try {
        const res = await fetch(withRoom(path), { headers: authHeaders() });
        if (!res.ok) return alert("다운로드 권한을 확인하세요.");
        const text = await res.text();
        const blob = new Blob([text], { type });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        alert("네트워크 문제로 다운로드하지 못했습니다.");
      }
    }

    async function purgeEvents() {
      if (!confirm("촬영 로그를 삭제할까요? export 후 삭제하는 것을 권장합니다.")) return;
      const typedRoom = prompt("삭제할 room 이름을 정확히 입력하세요.", "");
      if (normalizeRoomId(typedRoom || "") !== roomId) {
        return alert("room 이름이 일치하지 않아 삭제하지 않았습니다.");
      }
      try {
        const res = await fetch(withRoom("/api/purge"), {
          method: "POST",
          headers: authHeaders({ "x-purge-room": roomId })
        });
        if (!res.ok) return alert("삭제 권한 또는 room 확인 헤더를 확인하세요.");
        sessions.clear();
        selected = null;
        renderStudents();
        chatEl.innerHTML = "<div class='empty'>촬영 로그가 삭제되었습니다.</div>";
        auditEl.textContent = "교사용 감사 JSON 대기 중";
      } catch (error) {
        alert("네트워크 문제로 촬영 로그를 삭제하지 못했습니다.");
      }
    }

    async function postTeacherConfig(payload) {
      try {
        const res = await fetch(withRoom("/api/config"), {
          method: "POST",
          headers: authHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ level: payload.level, persona: payload.persona })
        });
        const config = await readJsonSafely(res);
        if (!res.ok) {
          configStatusEl.value = "저장 실패: 권한 또는 연결 확인";
          return;
        }
        applyTeacherConfig(config);
      } catch (error) {
        configStatusEl.value = "저장 실패: 네트워크 확인";
      }
    }

    function authHeaders(extra = {}) {
      return {
        ...(teacherToken ? { "x-teacher-token": teacherToken } : {}),
        ...extra
      };
    }

    function withRoom(path) {
      return path + "?room=" + encodeURIComponent(roomId);
    }

    function buildRoomUrl(path, includeToken = false) {
      const url = new URL(path, location.origin);
      url.searchParams.set("room", roomId);
      if (includeToken && teacherToken) url.searchParams.set("token", teacherToken);
      return url.toString();
    }

    function exportFilename(kind, extension) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      return roomId + "-" + kind + "-" + stamp + "." + extension;
    }

    async function copyText(value, label) {
      try {
        await navigator.clipboard.writeText(value);
        updateSocketStatus(label + " copied");
      } catch {
        prompt(label + " URL", value);
      }
    }

    async function readJsonSafely(res) {
      try {
        return await res.json();
      } catch {
        return {};
      }
    }

    function encodeTeacherWebSocketProtocol(token) {
      const encoded = btoa(String(token)).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/g, "");
      return "teacher-token." + encoded;
    }

    function normalizeRoomId(value) {
      return String(value || "default-classroom")
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "default-classroom";
    }

    connect();
    setInterval(renderStudents, 5000);
    levelEl.addEventListener("change", sendTeacherConfig);
    personaEl.addEventListener("change", sendTeacherConfig);
    reconnectSocketEl.addEventListener("click", () => connect(true));
    copyStudentUrlEl.addEventListener("click", () => copyText(buildRoomUrl("/"), "student url"));
    copyTeacherUrlEl.addEventListener("click", () => copyText(buildRoomUrl("/teacher", true), "teacher url"));
    downloadExportEl.addEventListener("click", () => downloadJson("/api/export", exportFilename("classroom-export", "json")));
    downloadDebriefEl.addEventListener("click", () => downloadJson("/api/debrief", exportFilename("debrief-table", "json")));
    downloadDebriefCsvEl.addEventListener("click", () => downloadText("/api/debrief.csv", exportFilename("debrief-table", "csv"), "text/csv"));
    purgeEventsEl.addEventListener("click", purgeEvents);
  </script>
</body>
</html>`;
