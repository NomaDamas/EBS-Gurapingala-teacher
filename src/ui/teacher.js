export const teacherHtml = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>EBS with ChatGPT 교사용 실시간 대시보드</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Gowun+Dodum&family=IBM+Plex+Sans+KR:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --ink: #102a43;
      --muted: #62778a;
      --paper: #edf4f7;
      --card: rgba(255, 255, 255, .94);
      --ebs-blue: #006eb7;
      --ebs-navy: #073b65;
      --chat-green: #10a37f;
      --warning: #d35f2d;
      --danger: #b42318;
      --line: #d7e2e8;
      --shadow: 0 14px 38px rgba(16, 42, 67, .09);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      font-family: "Gowun Dodum", sans-serif;
      background:
        radial-gradient(circle at 8% 0%, rgba(0, 110, 183, .15), transparent 28rem),
        radial-gradient(circle at 100% 12%, rgba(16, 163, 127, .12), transparent 26rem),
        linear-gradient(rgba(255,255,255,.55) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,.55) 1px, transparent 1px),
        var(--paper);
      background-size: auto, auto, 32px 32px, 32px 32px, auto;
    }
    main {
      height: 100vh;
      display: grid;
      grid-template-columns: minmax(310px, 23vw) 1fr;
      gap: 14px;
      padding: 14px;
      overflow: hidden;
    }
    aside, section, header, .student {
      border: 1px solid var(--line);
      border-radius: 20px;
      background: var(--card);
      box-shadow: var(--shadow);
    }
    aside {
      min-height: 0;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      overflow: hidden;
    }
    header { padding: 16px 18px; }
    .brandRow, .panelHeading, .reviewHeading, .studentHeading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .brand {
      color: var(--ebs-blue);
      font-family: "IBM Plex Sans KR", sans-serif;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .roomPill, .teacherOnly, .modePill {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 5px 9px;
      font-size: 11px;
      font-weight: 700;
    }
    .roomPill { color: var(--ebs-navy); background: #e4f2fb; }
    .teacherOnly { color: #fff; background: var(--ebs-navy); }
    .modePill { color: #08745d; background: #dff7ef; }
    h1 {
      font-family: "IBM Plex Sans KR", sans-serif;
      font-size: clamp(25px, 3vw, 38px);
      margin: 4px 0 0;
      letter-spacing: -.045em;
    }
    h2, h3, p { margin-top: 0; }
    .headerLead {
      color: var(--muted);
      font-size: 13px;
      margin: 5px 0 0;
    }
    .controls { display: grid; grid-template-columns: repeat(4, minmax(150px, 1fr)); gap: 9px; margin-top: 13px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    label { display: grid; align-content: start; gap: 5px; font-size: 12px; color: var(--muted); }
    input, select, textarea, button {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 11px;
      padding: 9px 10px;
      font: inherit;
      background: #fff;
      color: var(--ink);
    }
    input[readonly] { background: #f4f8fa; }
    select:disabled {
      color: #7a8996;
      background: #edf1f3;
      cursor: not-allowed;
    }
    button {
      width: auto;
      border: 0;
      background: var(--ebs-navy);
      color: #fff;
      cursor: pointer;
      font-weight: 700;
    }
    button:hover { filter: brightness(1.07); }
    button.secondary { background: var(--ebs-blue); }
    button.danger { background: var(--danger); }
    textarea { min-height: 62px; resize: vertical; }
    .fieldHelp {
      min-height: 30px;
      margin: 0;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.35;
    }
    .mixOptions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; }
    .mixOptions label {
      display: inline-flex; align-items: center; gap: 4px; width: auto;
      padding: 6px 8px; border: 1px solid var(--line); border-radius: 999px;
      background: #fff; font-size: 10.5px; cursor: pointer;
    }
    .mixOptions input { width: auto; margin: 0; }
    .roomWarning {
      margin: 9px 0 0; padding: 8px 10px; border-left: 4px solid var(--warning);
      background: #fff8e8; color: #694d00; font-size: 11px;
    }
    #students {
      min-height: 0;
      display: grid;
      align-content: start;
      gap: 6px;
      overflow-y: auto;
      padding: 1px 3px 8px 1px;
      scrollbar-width: thin;
    }
    .student {
      padding: 9px 10px;
      cursor: pointer;
      display: grid;
      gap: 3px;
      border-radius: 13px;
      box-shadow: none;
      transition: border-color .15s ease, background .15s ease, transform .15s ease;
    }
    .student:hover { transform: translateY(-1px); border-color: #8cbddd; }
    .student.active { border-color: var(--ebs-blue); background: #eef8fe; box-shadow: 0 0 0 2px rgba(0,110,183,.12); }
    .student strong { font-family: "IBM Plex Sans KR", sans-serif; font-size: 13px; }
    .student small { color: var(--muted); font-size: 10.5px; line-height: 1.25; }
    .student.stale { background: #fafafa; }
    .student.attention { border-left: 4px solid var(--warning); }
    .studentMeta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .studentMeta small:first-child {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .studentMeta small:last-child { flex: 0 0 auto; }
    .classSummary {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 5px;
      padding: 7px;
      border-radius: 14px;
      background: #f4f9fc;
      border: 1px solid var(--line);
    }
    .classSummary span { display: grid; gap: 1px; text-align: center; font-size: 9.5px; color: var(--muted); }
    .classSummary strong { font-family: "IBM Plex Sans KR", sans-serif; font-size: 17px; color: var(--ink); }
    .studentFilters {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 5px;
    }
    .studentFilter {
      padding: 7px 8px;
      border: 1px solid var(--line);
      color: var(--muted);
      background: #fff;
      font-size: 10.5px;
    }
    .studentFilter[aria-pressed="true"] {
      border-color: var(--ebs-blue);
      color: var(--ebs-navy);
      background: #e8f5fc;
      box-shadow: inset 0 0 0 1px rgba(0, 110, 183, .12);
    }
    .dot {
      width: 8px;
      height: 8px;
      display: inline-block;
      border-radius: 50%;
      background: var(--chat-green);
      box-shadow: 0 0 0 3px rgba(16,163,127,.13);
      margin-right: 7px;
    }
    .dot.offline {
      background: #9aa8b3;
      box-shadow: 0 0 0 3px rgba(154,168,179,.16);
    }
    .layout { display: grid; grid-template-rows: auto 1fr; gap: 14px; min-width: 0; min-height: 0; }
    .panes { display: grid; grid-template-columns: minmax(320px, .8fr) minmax(460px, 1.2fr); gap: 14px; min-height: 0; }
    .conversationPanel, .reviewPanel { min-height: 0; overflow: hidden; }
    .conversationPanel { display: grid; grid-template-rows: auto 1fr; }
    .panelHeading, .reviewHeading { padding: 12px 14px; border-bottom: 1px solid var(--line); }
    .panelHeading h2, .reviewHeading h2 { margin: 0; font: 700 15px "IBM Plex Sans KR", sans-serif; }
    .reviewHeading > div { min-width: 0; }
    .reviewContext {
      max-width: 100%;
      margin: 3px 0 0;
      color: var(--muted);
      font-size: 10.5px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .reviewHeadingActions { display: flex; align-items: center; gap: 6px; }
    .latestTurnButton {
      padding: 5px 8px;
      color: #fff;
      background: var(--warning);
      font-size: 10px;
    }
    .hidden { display: none !important; }
    #chat { padding: 14px; overflow: auto; }
    .turnGroup { margin: 0 0 18px; }
    .turnLabel {
      margin: 0 0 6px;
      color: var(--muted);
      font: 700 10px "IBM Plex Sans KR", sans-serif;
    }
    .bubble { border-radius: 18px; padding: 12px 14px; margin: 7px 0; max-width: 78%; white-space: pre-wrap; }
    .studentMsg { background: var(--ebs-navy); color: #fff; margin-left: auto; }
    .botMsg { background: #edf8f5; border-left: 5px solid var(--chat-green); }
    .blockedMsg { border-left-color: var(--danger); background: #fff1ef; }
    .turnReviewButton {
      display: block;
      margin: 4px 0 0;
      padding: 5px 8px;
      border: 1px solid var(--line);
      color: var(--ebs-blue);
      background: #fff;
      font-size: 10px;
    }
    .turnReviewButton[aria-pressed="true"] {
      color: #fff;
      background: var(--ebs-blue);
    }
    .flag {
      display: inline-block;
      margin-left: 5px;
      border-radius: 999px;
      padding: 2px 6px;
      background: #ffebe6;
      color: var(--danger);
      font-size: 9px;
      font-weight: 700;
    }
    .reviewPanel { display: grid; grid-template-rows: auto auto minmax(110px, 1fr); }
    #teacherReview {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      padding: 12px;
      overflow: auto;
      background: #f8fbfc;
    }
    .reviewCard {
      min-width: 0;
      padding: 11px;
      border: 1px solid var(--line);
      border-radius: 13px;
      background: #fff;
    }
    .reviewCard.wide { grid-column: 1 / -1; }
    .reviewCard h3 {
      margin: 0 0 5px;
      color: var(--ebs-blue);
      font: 700 11px "IBM Plex Sans KR", sans-serif;
    }
    .reviewCard p { margin: 0; font-size: 12px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
    .verdictPass { border-left: 4px solid var(--chat-green); }
    .verdictFail { border-left: 4px solid var(--danger); }
    details { border-top: 1px solid var(--line); background: #fff; min-height: 0; overflow: auto; }
    summary { padding: 9px 13px; cursor: pointer; color: var(--muted); font-size: 11px; font-weight: 700; }
    pre {
      margin: 0;
      padding: 0 13px 13px;
      white-space: pre-wrap;
      font-size: 12px;
      line-height: 1.55;
      overflow-wrap: anywhere;
    }
    .empty { color: var(--muted); padding: 20px; }
    @media (max-width: 1180px) {
      .controls { grid-template-columns: repeat(2, minmax(150px, 1fr)); }
      .panes { grid-template-columns: minmax(280px, .7fr) minmax(400px, 1.3fr); }
    }
    @media (max-width: 1080px) {
      main { height: auto; min-height: 100vh; grid-template-columns: 1fr; overflow: visible; }
      aside { max-height: 48vh; }
      .layout { min-height: 100vh; }
      .panes { grid-template-columns: 1fr; }
      .conversationPanel { min-height: 420px; }
      .reviewPanel { min-height: 560px; }
    }
    @media (max-width: 560px) {
      main { padding: 8px; gap: 8px; }
      header { padding: 14px; }
      .controls, #teacherReview { grid-template-columns: 1fr; }
      .reviewCard.wide { grid-column: auto; }
      .actions button { flex: 1 1 calc(50% - 8px); }
      .bubble { max-width: 92%; }
      .classSummary { position: sticky; top: 0; z-index: 2; }
    }
  </style>
</head>
<body>
  <main>
    <aside>
      <div class="studentHeading">
        <strong>학생 모니터</strong>
        <span class="modePill">최대 35명</span>
      </div>
      <div class="classSummary" id="classSummary">
        <span>전체<strong>0</strong></span>
        <span>온라인<strong>0</strong></span>
        <span>채팅턴<strong>0</strong></span>
        <span>차단턴<strong>0</strong></span>
        <span>정정필요<strong>0</strong></span>
      </div>
      <div class="studentFilters" aria-label="학생 목록 필터">
        <button class="studentFilter" type="button" data-filter="all" aria-pressed="true">전체</button>
        <button class="studentFilter" type="button" data-filter="online" aria-pressed="false">온라인</button>
        <button class="studentFilter" type="button" data-filter="attention" aria-pressed="false">주의 필요</button>
      </div>
      <div id="students"></div>
    </aside>
    <div class="layout">
      <header>
        <div class="brandRow">
          <span class="brand">EBS with ChatGPT · Teacher Console</span>
          <span class="roomPill" id="roomStatus">room: default-classroom</span>
        </div>
        <h1>실시간 교실 관찰</h1>
        <p class="headerLead">학생 응답과 교사용 검수 근거를 분리해 한 화면에서 확인합니다.</p>
        <div class="controls">
          <label>응답 모드
            <select id="responseMode" aria-describedby="responseModeHelp">
              <option value="experiment" selected>실험 · 진실+거짓</option>
              <option value="truth">진실 · 검수 사실만</option>
              <option value="mixed">혼합 · 진실/복수 Level</option>
            </select>
            <span class="fieldHelp" id="responseModeHelp">단일 Level 또는 선택한 진실/Level 조합을 턴별로 적용합니다.</span>
          </label>
          <label>거짓 Level
            <select id="level" aria-describedby="levelHelp">
              <option value="1">Level 1 사실 오류</option>
              <option value="2" selected>Level 2 과장·단순화</option>
              <option value="3">Level 3 관점 왜곡</option>
              <option value="4">Level 4 AI 환각</option>
            </select>
            <span class="fieldHelp" id="levelHelp" aria-live="polite">실험 모드에서 학생 응답에 적용됩니다.</span>
          </label>
          <label>연결 상태
            <input id="socketStatus" value="connecting" readonly aria-live="polite" />
            <span class="fieldHelp">마지막 텔레메트리 시각과 재시도 횟수를 표시합니다.</span>
          </label>
          <label>설정 적용 상태
            <input id="configStatus" value="server sync 대기" readonly aria-live="polite" />
            <span class="fieldHelp">서버가 확인한 응답 모드와 Level을 표시합니다.</span>
          </label>
        </div>
        <div class="actions">
          <button id="reconnectSocket">실시간 연결 재시도</button>
          <button id="copyStudentUrl">학생 URL 복사</button>
          <button id="copyTeacherUrl">교사용 URL 복사</button>
          <button id="copyAuditJson">감사 JSON 복사</button>
        </div>
        <div id="mixControl" class="mixOptions hidden" aria-label="혼합 모드 구성">
          <label><input type="checkbox" name="mixLevel" value="0" checked /> 진실</label>
          <label><input type="checkbox" name="mixLevel" value="1" checked /> Level 1</label>
          <label><input type="checkbox" name="mixLevel" value="2" checked /> Level 2</label>
          <label><input type="checkbox" name="mixLevel" value="3" checked /> Level 3</label>
          <label><input type="checkbox" name="mixLevel" value="4" checked /> Level 4</label>
        </div>
        <p class="roomWarning" id="roomWarning"></p>
        <label style="margin-top:10px">페르소나 시스템 프롬프트
          <textarea id="persona">일반적인 ChatGPT처럼 자연스럽고 명확한 한국어로 대화한다. 역할극 말투를 쓰지 않는다.</textarea>
        </label>
        <div class="actions">
          <button id="downloadExport">전체 로그 JSON</button>
          <button class="secondary" id="downloadDebrief">정정 수업 오류표</button>
          <button class="secondary" id="downloadDebriefCsv">오류표 CSV</button>
          <button class="danger" id="purgeEvents">촬영 로그 삭제</button>
        </div>
      </header>
      <div class="panes">
        <section class="conversationPanel" id="conversationPanel">
          <div class="panelHeading">
            <h2>학생에게 보인 대화</h2>
            <span class="modePill">학생 노출</span>
          </div>
          <div id="chat"><div class="empty">학생 카드를 클릭하면 대화가 표시됩니다.</div></div>
        </section>
        <section class="reviewPanel" id="reviewPanel" aria-labelledby="teacherReviewTitle">
          <div class="reviewHeading">
            <div>
              <h2 id="teacherReviewTitle">교사용 검수 영역</h2>
              <p class="reviewContext" id="teacherReviewContext" aria-live="polite">학생과 대화 턴을 선택하세요.</p>
            </div>
            <div class="reviewHeadingActions">
              <button class="latestTurnButton hidden" id="latestTurnButton" type="button">새 턴 보기</button>
              <span class="teacherOnly">교사 전용 · 학생 비노출</span>
            </div>
          </div>
          <div id="teacherReview">
            <div class="empty">대화를 선택하면 정답·거짓·검수 근거가 표시됩니다.</div>
          </div>
          <details>
            <summary>원시 감사 JSON 보기</summary>
            <pre id="audit">교사용 감사 JSON 대기 중</pre>
          </details>
        </section>
      </div>
    </div>
  </main>
  <script>
    const studentsEl = document.querySelector("#students");
    const classSummaryEl = document.querySelector("#classSummary");
    const chatEl = document.querySelector("#chat");
    const conversationPanelEl = document.querySelector("#conversationPanel");
    const auditEl = document.querySelector("#audit");
    const statusEl = document.querySelector("#socketStatus");
    const configStatusEl = document.querySelector("#configStatus");
    const roomStatusEl = document.querySelector("#roomStatus");
    const responseModeEl = document.querySelector("#responseMode");
    const levelEl = document.querySelector("#level");
    const levelHelpEl = document.querySelector("#levelHelp");
    const mixControlEl = document.querySelector("#mixControl");
    const mixLevelEls = [...document.querySelectorAll('[name="mixLevel"]')];
    const roomWarningEl = document.querySelector("#roomWarning");
    const personaEl = document.querySelector("#persona");
    const teacherReviewEl = document.querySelector("#teacherReview");
    const reviewPanelEl = document.querySelector("#reviewPanel");
    const teacherReviewContextEl = document.querySelector("#teacherReviewContext");
    const latestTurnButtonEl = document.querySelector("#latestTurnButton");
    const downloadExportEl = document.querySelector("#downloadExport");
    const downloadDebriefEl = document.querySelector("#downloadDebrief");
    const downloadDebriefCsvEl = document.querySelector("#downloadDebriefCsv");
    const purgeEventsEl = document.querySelector("#purgeEvents");
    const reconnectSocketEl = document.querySelector("#reconnectSocket");
    const copyStudentUrlEl = document.querySelector("#copyStudentUrl");
    const copyTeacherUrlEl = document.querySelector("#copyTeacherUrl");
    const copyAuditJsonEl = document.querySelector("#copyAuditJson");
    const studentFilterEls = [...document.querySelectorAll("[data-filter]")];
    const sessions = new Map();
    const seenEventIds = new Set();
    const params = new URLSearchParams(location.search);
    const teacherToken = params.get("token") || localStorage.getItem("teacher-token") || "";
    const roomId = normalizeRoomId(params.get("room") || "default-classroom");
    roomStatusEl.textContent = "room: " + roomId;
    roomWarningEl.textContent = roomId === "default-classroom"
      ? "현재 기본방입니다. 학생 URL에 room 파라미터가 없으면 이 방으로 들어옵니다. ebs test 기록은 이 기본방에 있습니다."
      : "현재 " + roomId + " 방만 보고 있습니다. 학생 URL에도 ?room=" + roomId + "가 있어야 이 대시보드에 표시됩니다.";
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
    let selectedTurn = null;
    let reviewPinned = false;
    let studentFilter = "all";
    let processingSnapshot = false;
    let liveTelemetrySinceConnect = false;

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
      liveTelemetrySinceConnect = false;
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
        if (telemetry) {
          if (telemetry.type !== "snapshot") liveTelemetrySinceConnect = true;
          handleTelemetry(telemetry);
        }
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
      const mixLevels = selectedMixLevels();
      if (responseModeEl.value === "mixed" && mixLevels.length < 2) {
        configStatusEl.value = "저장 실패: 혼합 모드는 2개 이상 선택";
        return;
      }
      const modeLabel = responseModeLabel(responseModeEl.value, levelEl.value, mixLevels);
      configStatusEl.value = "저장 중: " + modeLabel;
      const payload = {
        type: "teacher_config",
        responseMode: responseModeEl.value,
        level: levelEl.value,
        mixLevels,
        persona: personaEl.value
      };
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
        const previousSelected = selected;
        const previousSelectedTurn = selectedTurn;
        const previousReviewPinned = reviewPinned;
        if (!liveTelemetrySinceConnect) {
          sessions.clear();
          seenEventIds.clear();
          selected = null;
        }
        if (event.config) applyTeacherConfig(event.config);
        processingSnapshot = true;
        try {
          for (const item of event.events || []) handleTelemetry(item);
        } finally {
          processingSnapshot = false;
        }
        if (previousSelected && sessions.has(previousSelected)) selected = previousSelected;
        selectedTurn = selected && previousReviewPinned ? previousSelectedTurn : null;
        reviewPinned = Boolean(selected && previousReviewPinned);
        latestTurnButtonEl.classList.add("hidden");
        renderStudents();
        if (selected) renderSelected();
        else renderEmptyChat("학생 카드를 클릭하면 대화가 표시됩니다.");
        return;
      }
      if (event.eventId) {
        if (seenEventIds.has(event.eventId)) return;
        seenEventIds.add(event.eventId);
      }
      if (event.type === "teacher_config_updated") {
        applyTeacherConfig(event.config || event);
        auditEl.textContent = JSON.stringify({
          type: "teacher_config_updated",
          responseMode: responseModeEl.value,
          level: levelEl.value,
          mixLevels: selectedMixLevels(),
          persona: personaEl.value,
          at: event.at
        }, null, 2);
        return;
      }
      if (event.type === "teacher_config_rejected") {
        configStatusEl.value = "저장 실패: " + (event.message || event.error || "페르소나 검수 실패");
        auditEl.textContent = JSON.stringify(event, null, 2);
        return;
      }
      if (event.type === "events_purged") {
        auditEl.textContent = JSON.stringify(event, null, 2);
        sessions.clear();
        seenEventIds.clear();
        selected = null;
        selectedTurn = null;
        renderStudents();
        renderEmptyChat("촬영 로그가 삭제되었습니다.");
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
        const turn = (current.chatTurns || 0) + 1;
        current.messages.push({ role: "student", text: event.studentMessage, turn });
        current.messages.push({
          role: "bot",
          text: event.studentVisibleAnswer,
          blockedForStudent: Boolean(event.blockedForStudent),
          audit: event.teacherAudit,
          turn
        });
        current.audit = event.teacherAudit;
        current.latencyMs = event.latencyMs;
        current.lastQuestion = event.studentMessage;
        current.lastChatAtMs = current.lastSeenMs;
        current.blockedForStudent = Boolean(event.blockedForStudent);
        current.chatTurns = (current.chatTurns || 0) + 1;
        current.responseMode = event.teacherAudit?.input?.responseMode || current.responseMode || "experiment";
        current.appliedLevel = event.teacherAudit?.input?.appliedLevel ?? current.appliedLevel ?? null;
        if (event.blockedForStudent) current.blockedTurns = (current.blockedTurns || 0) + 1;
        if (!event.blockedForStudent && event.teacherAudit?.input?.appliedLevel) {
          current.debriefRequiredTurns = (current.debriefRequiredTurns || 0) + 1;
        }
      }
      sessions.set(event.sessionId, current);
      if (!selected) selected = event.sessionId;
      const shouldFollowLatest = selected === event.sessionId && event.type === "chat_turn" && !reviewPinned;
      if (shouldFollowLatest) selectedTurn = null;
      if (selected === event.sessionId && event.type === "chat_turn" && reviewPinned) {
        latestTurnButtonEl.classList.remove("hidden");
      }
      if (processingSnapshot) return;
      renderStudents();
      if (selected === event.sessionId) {
        renderSelected();
        if (shouldFollowLatest) {
          requestAnimationFrame(() => {
            chatEl.scrollTop = chatEl.scrollHeight;
          });
        }
      }
    }

    function renderStudents() {
      const focusedSessionId = document.activeElement?.dataset?.sessionId || null;
      studentsEl.replaceChildren();
      let onlineCount = 0;
      let chatTurns = 0;
      let blockedTurns = 0;
      let debriefRequiredTurns = 0;
      const visibleSessions = [...sessions.entries()]
        .map(([id, session]) => {
          session.online = Date.now() - (session.lastSeenMs || 0) < 35000;
          return [id, session];
        })
        .sort(compareStudentPriority);
      for (const [id, session] of visibleSessions) {
        if (session.online) onlineCount += 1;
        chatTurns += session.chatTurns || 0;
        blockedTurns += session.blockedTurns || 0;
        debriefRequiredTurns += session.debriefRequiredTurns || 0;
        if (!studentMatchesFilter(session)) continue;
        const needsAttention = Boolean(session.blockedTurns || session.debriefRequiredTurns);
        const el = document.createElement("article");
        el.className = "student"
          + (id === selected ? " active" : "")
          + (needsAttention ? " attention" : "")
          + (!session.online ? " stale" : "");
        const dotClass = session.online ? "dot" : "dot offline";
        const state = session.online ? "online" : "offline";
        const needsAttentionLabel = needsAttention ? " · 주의 필요" : "";
        const modeLevel = session.responseMode === "truth"
          ? "truth · Level 비적용"
          : "experiment · Level " + (session.appliedLevel || "확인 중");
        el.tabIndex = 0;
        el.dataset.sessionId = id;
        el.setAttribute("role", "button");
        el.setAttribute("aria-current", String(id === selected));
        el.setAttribute("aria-label", session.name + " 학생 대화 보기 · " + state + needsAttentionLabel + " · " + modeLevel);
        const latency = Number.isFinite(session.latencyMs) ? " · " + session.latencyMs + "ms" : "";
        const title = document.createElement("strong");
        const dot = document.createElement("span");
        dot.className = dotClass;
        title.appendChild(dot);
        title.appendChild(document.createTextNode(session.name));
        if (session.blockedForStudent || session.blockedTurns) {
          const blocked = document.createElement("span");
          blocked.className = "flag";
          blocked.textContent = session.blockedTurns ? "blocked " + session.blockedTurns : "blocked";
          title.appendChild(blocked);
        }
        if (session.debriefRequiredTurns) {
          const debrief = document.createElement("span");
          debrief.className = "flag";
          debrief.textContent = "정정 " + session.debriefRequiredTurns;
          title.appendChild(debrief);
        }
        const metaRow = document.createElement("div");
        metaRow.className = "studentMeta";
        const meta = document.createElement("small");
        const recentQuestion = session.lastQuestion ? " · 질문: " + trimCardText(session.lastQuestion) : "";
        meta.textContent = modeLevel + " · " + (session.chatTurns || 0) + "턴" + latency + recentQuestion;
        const freshness = document.createElement("small");
        freshness.textContent = telemetryAgeLabel(session.lastSeenMs);
        freshness.title = state + " · 마지막 이벤트 " + (session.updatedAt || "없음");
        metaRow.append(meta, freshness);
        el.appendChild(title);
        el.appendChild(metaRow);
        el.addEventListener("click", () => {
          selected = id;
          selectedTurn = null;
          reviewPinned = false;
          latestTurnButtonEl.classList.add("hidden");
          renderStudents();
          renderSelected();
          if (window.matchMedia("(max-width: 900px)").matches) {
            conversationPanelEl.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });
        el.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          el.click();
        });
        studentsEl.appendChild(el);
      }
      if (!studentsEl.childElementCount) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = studentFilter === "all"
          ? "아직 수신된 학생 텔레메트리가 없습니다."
          : "이 조건에 해당하는 학생이 없습니다.";
        studentsEl.appendChild(empty);
      }
      renderClassSummary({ total: sessions.size, online: onlineCount, chatTurns, blockedTurns, debriefRequiredTurns });
      if (focusedSessionId) {
        const focusedCard = [...studentsEl.querySelectorAll("[data-session-id]")]
          .find((item) => item.dataset.sessionId === focusedSessionId);
        focusedCard?.focus({ preventScroll: true });
      }
    }

    function renderClassSummary({ total, online, chatTurns, blockedTurns, debriefRequiredTurns }) {
      classSummaryEl.replaceChildren(
        summaryMetric("전체", total),
        summaryMetric("온라인", online),
        summaryMetric("채팅턴", chatTurns),
        summaryMetric("차단턴", blockedTurns),
        summaryMetric("정정필요", debriefRequiredTurns)
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
      chatEl.replaceChildren();
      const selectedBotMessage = findReviewMessage(session);
      for (const turn of groupMessagesByTurn(session.messages)) {
        const group = document.createElement("article");
        group.className = "turnGroup";
        const label = document.createElement("p");
        label.className = "turnLabel";
        label.textContent = turn.turn + "번째 대화 턴";
        group.appendChild(label);
        for (const message of turn.messages) {
          const el = document.createElement("div");
          el.className = "bubble " + (message.role === "student" ? "studentMsg" : "botMsg") + (message.blockedForStudent ? " blockedMsg" : "");
          el.textContent = message.text;
          group.appendChild(el);
          if (message.role === "bot" && message.audit) {
            const reviewButton = document.createElement("button");
            reviewButton.type = "button";
            reviewButton.className = "turnReviewButton";
            reviewButton.textContent = message.blockedForStudent ? "차단된 턴 검수" : "이 턴 검수";
            reviewButton.setAttribute("aria-pressed", String(selectedTurn === message.turn));
            reviewButton.addEventListener("click", () => {
              selectedTurn = message.turn;
              reviewPinned = true;
              latestTurnButtonEl.classList.add("hidden");
              renderSelected();
              if (window.matchMedia("(max-width: 900px)").matches) {
                reviewPanelEl.scrollIntoView({ behavior: "smooth", block: "start" });
              }
            });
            group.appendChild(reviewButton);
          }
        }
        chatEl.appendChild(group);
      }
      const selectedAudit = selectedBotMessage?.audit || session.audit;
      const selectedMode = selectedAudit?.input?.responseMode || session.responseMode || "experiment";
      const selectedLevel = selectedMode === "truth"
        ? "Level 비적용"
        : "Level " + (selectedAudit?.input?.appliedLevel || session.appliedLevel || "확인 중");
      teacherReviewContextEl.textContent = session.name
        + " · " + (selectedBotMessage ? selectedBotMessage.turn + "턴" : "입장 이벤트")
        + " · " + selectedMode + " · " + selectedLevel;
      renderTeacherReview(selectedAudit, Boolean(selectedBotMessage?.blockedForStudent ?? session.blockedForStudent));
      auditEl.textContent = selectedAudit ? JSON.stringify(selectedAudit, null, 2) : "입장 이벤트만 수신됨";
    }

    function applyTeacherConfig(config) {
      if (["experiment", "truth", "mixed"].includes(config.responseMode)) {
        responseModeEl.value = config.responseMode;
      }
      if (config.level) levelEl.value = String(config.level);
      if (Array.isArray(config.mixLevels)) {
        const selectedMix = new Set(config.mixLevels.map(Number));
        for (const checkbox of mixLevelEls) checkbox.checked = selectedMix.has(Number(checkbox.value));
      }
      if (config.persona) personaEl.value = config.persona;
      updateResponseModeUi();
      const appliedAt = config.updatedAt ? new Date(config.updatedAt).toLocaleTimeString() : new Date().toLocaleTimeString();
      const appliedMode = responseModeLabel(responseModeEl.value, levelEl.value, selectedMixLevels());
      configStatusEl.value = "적용됨: " + appliedMode + " · " + appliedAt;
    }

    function updateResponseModeUi() {
      const truthMode = responseModeEl.value === "truth";
      const mixedMode = responseModeEl.value === "mixed";
      levelEl.disabled = truthMode || mixedMode;
      levelEl.setAttribute("aria-disabled", String(truthMode || mixedMode));
      mixControlEl.classList.toggle("hidden", !mixedMode);
      levelHelpEl.textContent = truthMode
        ? "진실 모드에서는 Level을 적용하지 않습니다. 검수된 사실만 학생에게 표시됩니다."
        : mixedMode
          ? "선택한 진실/Level을 학생별 턴 순서대로 반복 적용합니다."
          : "실험 모드에서 통제된 거짓의 강도를 Level 1~4로 적용합니다.";
    }

    function renderTeacherReview(audit, blockedForStudent = false) {
      teacherReviewEl.replaceChildren();
      if (!audit) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "아직 교사용 검수 데이터가 없습니다.";
        teacherReviewEl.appendChild(empty);
        return;
      }
      const truthMode = Boolean(audit.input && audit.input.responseMode === "truth");
      const appliedLevel = audit.input && audit.input.appliedLevel
        ? "Level " + audit.input.appliedLevel
        : truthMode ? "비적용 · truth 모드는 검수된 사실만 제공" : "Level 정보 없음";
      const verdict = audit.preflight && audit.preflight.verdict
        ? audit.preflight.verdict
        : blockedForStudent ? "학생 노출 차단" : "검수 결과 없음";
      const approved = Boolean(audit.preflight && audit.preflight.approvedForStudent);
      teacherReviewEl.append(
        reviewCard("정답 · 교사 기준", audit.correctAnswer, "wide"),
        reviewCard(
          truthMode ? "거짓 · truth 모드 비적용" : "거짓 · 학생용 생성안",
          truthMode ? "생성하지 않음 · 학생에게 검수된 사실만 표시" : audit.falseClaim || audit.studentVisibleFalseAnswer
        ),
        reviewCard(
          truthMode ? "왜 거짓인가 · 비적용" : "왜 거짓인가",
          truthMode ? "truth 모드는 거짓 정보를 생성하거나 노출하지 않음" : audit.whyFalse
        ),
        reviewCard("Level 근거", appliedLevel + (audit.levelFitReason ? " · " + audit.levelFitReason : ""), "wide"),
        reviewCard(
          "검수 결과",
          verdict + " · " + (blockedForStudent ? "학생에게 차단됨" : approved ? "학생 노출 승인" : "승인 상태 확인 필요"),
          "wide " + (approved && !blockedForStudent ? "verdictPass" : "verdictFail")
        )
      );
    }

    function reviewCard(title, value, className = "") {
      const card = document.createElement("article");
      card.className = "reviewCard" + (className ? " " + className : "");
      const heading = document.createElement("h3");
      const body = document.createElement("p");
      heading.textContent = title;
      body.textContent = value || "정보 없음";
      card.append(heading, body);
      return card;
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
        selectedTurn = null;
        renderStudents();
        renderEmptyChat("촬영 로그가 삭제되었습니다.");
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
          body: JSON.stringify({
            responseMode: payload.responseMode,
            level: payload.level,
            mixLevels: payload.mixLevels,
            persona: payload.persona
          })
        });
        const config = await readJsonSafely(res);
        if (!res.ok) {
          configStatusEl.value = "저장 실패: " + (config.message || "권한 또는 연결 확인");
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

    function selectedMixLevels() {
      return mixLevelEls.filter((item) => item.checked).map((item) => Number(item.value));
    }

    function responseModeLabel(mode, level, mixLevels) {
      if (mode === "truth") return "truth · Level 비적용";
      if (mode === "mixed") {
        return "mixed · " + mixLevels.map((item) => item === 0 ? "진실" : "L" + item).join("+");
      }
      return "experiment · Level " + level;
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

    function renderEmptyChat(message) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = message;
      chatEl.replaceChildren(empty);
      teacherReviewContextEl.textContent = "학생과 대화 턴을 선택하세요.";
      reviewPinned = false;
      latestTurnButtonEl.classList.add("hidden");
      renderTeacherReview(null);
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

    function trimCardText(value) {
      const text = String(value || "").replace(/\\s+/g, " ").trim();
      return text.length > 34 ? text.slice(0, 34) + "..." : text;
    }

    function studentMatchesFilter(session) {
      if (studentFilter === "online") return session.online;
      if (studentFilter === "attention") return Boolean(session.blockedTurns || session.debriefRequiredTurns);
      return true;
    }

    function compareStudentPriority([, left], [, right]) {
      const leftAttention = Boolean(left.blockedTurns || left.debriefRequiredTurns);
      const rightAttention = Boolean(right.blockedTurns || right.debriefRequiredTurns);
      if (leftAttention !== rightAttention) return leftAttention ? -1 : 1;
      if (left.online !== right.online) return left.online ? -1 : 1;
      const chatActivity = (right.lastChatAtMs || 0) - (left.lastChatAtMs || 0);
      if (chatActivity) return chatActivity;
      return String(left.name || "").localeCompare(String(right.name || ""), "ko");
    }

    function telemetryAgeLabel(lastSeenMs) {
      if (!lastSeenMs) return "수신 대기";
      const seconds = Math.max(0, Math.floor((Date.now() - lastSeenMs) / 1000));
      if (seconds < 5) return "방금";
      if (seconds < 60) return seconds + "초 전";
      return Math.floor(seconds / 60) + "분 전";
    }

    function groupMessagesByTurn(messages) {
      const turns = [];
      for (const message of messages) {
        let group = turns[turns.length - 1];
        if (!group || group.turn !== message.turn) {
          group = { turn: message.turn || turns.length + 1, messages: [] };
          turns.push(group);
        }
        group.messages.push(message);
      }
      return turns;
    }

    function findReviewMessage(session) {
      const reviewable = session.messages.filter((message) => message.role === "bot" && message.audit);
      if (!reviewable.length) return null;
      const selectedMessage = reviewable.find((message) => message.turn === selectedTurn);
      if (selectedMessage) return selectedMessage;
      const latestMessage = reviewable[reviewable.length - 1];
      selectedTurn = latestMessage.turn;
      return latestMessage;
    }

    updateResponseModeUi();
    connect();
    setInterval(renderStudents, 5000);
    studentFilterEls.forEach((button) => {
      button.addEventListener("click", () => {
        studentFilter = button.dataset.filter;
        for (const item of studentFilterEls) {
          item.setAttribute("aria-pressed", String(item === button));
        }
        renderStudents();
      });
    });
    levelEl.addEventListener("change", sendTeacherConfig);
    responseModeEl.addEventListener("change", () => {
      updateResponseModeUi();
      sendTeacherConfig();
    });
    mixLevelEls.forEach((checkbox) => checkbox.addEventListener("change", sendTeacherConfig));
    personaEl.addEventListener("change", sendTeacherConfig);
    reconnectSocketEl.addEventListener("click", () => connect(true));
    latestTurnButtonEl.addEventListener("click", () => {
      reviewPinned = false;
      selectedTurn = null;
      latestTurnButtonEl.classList.add("hidden");
      renderSelected();
      requestAnimationFrame(() => {
        chatEl.scrollTop = chatEl.scrollHeight;
      });
    });
    copyStudentUrlEl.addEventListener("click", () => copyText(buildRoomUrl("/"), "student url"));
    copyTeacherUrlEl.addEventListener("click", () => copyText(buildRoomUrl("/teacher", true), "teacher url"));
    copyAuditJsonEl.addEventListener("click", () => copyText(auditEl.textContent, "audit json"));
    downloadExportEl.addEventListener("click", () => downloadJson("/api/export", exportFilename("classroom-export", "json")));
    downloadDebriefEl.addEventListener("click", () => downloadJson("/api/debrief", exportFilename("debrief-table", "json")));
    downloadDebriefCsvEl.addEventListener("click", () => downloadText("/api/debrief.csv", exportFilename("debrief-table", "csv"), "text/csv"));
    purgeEventsEl.addEventListener("click", purgeEvents);
  </script>
</body>
</html>`;
