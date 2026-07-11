export const studentHtml = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#f4f1e9" />
  <title>EBS with ChatGPT | 질문의 온도</title>
  <style>
    :root {
      --navy-950: #10263f;
      --navy-800: #193b5c;
      --navy-650: #315977;
      --orange: #e35d2f;
      --orange-soft: #f9e6dc;
      --teal: #167b78;
      --paper: #f4f1e9;
      --paper-deep: #eae5da;
      --surface: #fffefa;
      --ink: #17212b;
      --muted: #64717d;
      --line: #d9d7cf;
      --line-strong: #c6c4bc;
      --danger: #b33b2e;
      --danger-soft: #fff0ec;
      --shadow: 0 24px 70px rgba(16, 38, 63, .12);
      --sans: "SUIT", "Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif;
      --serif: "KoPub Batang", "Noto Serif KR", "Batang", Georgia, serif;
    }

    * { box-sizing: border-box; }

    html, body { height: 100%; }

    body {
      margin: 0;
      color: var(--ink);
      font-family: var(--sans);
      background:
        linear-gradient(90deg, rgba(16, 38, 63, .035) 1px, transparent 1px),
        linear-gradient(rgba(16, 38, 63, .035) 1px, transparent 1px),
        var(--paper);
      background-size: 28px 28px;
    }

    button, input, textarea { font: inherit; }
    button { -webkit-tap-highlight-color: transparent; }

    .app-shell {
      display: grid;
      grid-template-columns: minmax(250px, 310px) minmax(0, 1fr);
      width: min(1480px, 100%);
      min-height: 100dvh;
      margin: 0 auto;
      background: var(--surface);
      box-shadow: var(--shadow);
    }

    .lesson-rail {
      position: relative;
      display: flex;
      flex-direction: column;
      min-height: 100dvh;
      overflow: hidden;
      padding: 34px 30px 28px;
      color: #f8f6ef;
      background:
        radial-gradient(circle at 20% 10%, rgba(255, 255, 255, .12), transparent 18rem),
        var(--navy-950);
    }

    .lesson-rail::after {
      content: "";
      position: absolute;
      right: -80px;
      bottom: 72px;
      width: 230px;
      aspect-ratio: 1;
      border: 46px solid rgba(227, 93, 47, .78);
      border-radius: 50%;
      pointer-events: none;
    }

    .brand {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      gap: 11px;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: .08em;
    }

    .ebs-mark {
      display: grid;
      place-items: center;
      width: 46px;
      height: 30px;
      border: 2px solid currentColor;
      border-radius: 50%;
      font-family: Georgia, serif;
      font-size: 15px;
      letter-spacing: -.08em;
    }

    .lesson-number {
      position: relative;
      z-index: 1;
      margin-top: 76px;
      color: #f2a587;
      font-family: Georgia, serif;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .2em;
      text-transform: uppercase;
    }

    .lesson-rail h1 {
      position: relative;
      z-index: 1;
      max-width: 220px;
      margin: 14px 0 20px;
      font-family: var(--serif);
      font-size: clamp(34px, 3.2vw, 49px);
      font-weight: 700;
      line-height: 1.18;
      letter-spacing: -.055em;
      word-break: keep-all;
    }

    .lesson-summary {
      position: relative;
      z-index: 1;
      margin: 0;
      color: rgba(248, 246, 239, .72);
      font-size: 14px;
      line-height: 1.72;
      word-break: keep-all;
    }

    .rail-rule {
      position: relative;
      z-index: 1;
      width: 42px;
      height: 3px;
      margin: 30px 0 24px;
      border: 0;
      background: var(--orange);
    }

    .lesson-points {
      position: relative;
      z-index: 1;
      display: grid;
      gap: 15px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .lesson-points li {
      display: grid;
      grid-template-columns: 25px 1fr;
      gap: 10px;
      color: rgba(248, 246, 239, .8);
      font-size: 13px;
      line-height: 1.5;
    }

    .point-number {
      color: #f2a587;
      font-family: Georgia, serif;
      font-size: 12px;
      font-weight: 700;
    }

    .privacy-rail {
      position: relative;
      z-index: 1;
      margin-top: auto;
      padding-top: 64px;
      color: rgba(248, 246, 239, .58);
      font-size: 11px;
      line-height: 1.55;
    }

    .workspace {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      min-width: 0;
      height: 100dvh;
      background:
        linear-gradient(180deg, rgba(244, 241, 233, .68), transparent 150px),
        var(--surface);
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 72px;
      padding: 14px clamp(20px, 4vw, 52px);
      border-bottom: 1px solid var(--line);
      background: rgba(255, 254, 250, .88);
      backdrop-filter: blur(14px);
    }

    .mobile-brand { display: none; }

    .course-label {
      display: flex;
      align-items: center;
      gap: 9px;
      color: var(--navy-800);
      font-size: 13px;
      font-weight: 750;
    }

    .course-label::before {
      content: "";
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--orange);
      box-shadow: 0 0 0 5px var(--orange-soft);
    }

    .status-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .status-pill, .room-pill, .turn-pill {
      display: inline-flex;
      align-items: center;
      min-height: 30px;
      border: 1px solid var(--line);
      border-radius: 999px;
      color: var(--muted);
      background: var(--surface);
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }

    .status-pill { gap: 7px; padding: 6px 11px; }
    .room-pill { max-width: 220px; padding: 6px 10px; overflow: hidden; text-overflow: ellipsis; }
    .turn-pill {
      gap: 6px;
      padding: 6px 10px;
      color: var(--navy-800);
      background: var(--orange-soft);
      border-color: #efd2c3;
    }

    .turn-pill strong {
      font-family: Georgia, serif;
      font-size: 13px;
    }

    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #a4abb1;
    }

    .status-pill[data-state="loading"] .status-dot {
      background: var(--orange);
      animation: pulse 1s ease-in-out infinite;
    }

    .status-pill[data-state="online"] .status-dot {
      background: var(--teal);
      box-shadow: 0 0 0 3px rgba(22, 123, 120, .14);
    }

    .status-pill[data-state="error"] .status-dot { background: var(--danger); }

    .conversation-stage {
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      scroll-behavior: smooth;
    }

    .conversation-inner {
      width: min(820px, 100%);
      min-height: 100%;
      margin: 0 auto;
      padding: clamp(30px, 6vh, 70px) clamp(20px, 5vw, 54px) 38px;
    }

    .join-card {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(270px, 330px);
      gap: clamp(28px, 6vw, 64px);
      align-items: center;
      min-height: min(560px, calc(100dvh - 150px));
    }

    .join-copy .eyebrow, .welcome .eyebrow {
      display: flex;
      align-items: center;
      gap: 9px;
      margin: 0 0 14px;
      color: var(--orange);
      font-family: Georgia, serif;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .16em;
      text-transform: uppercase;
    }

    .join-copy h2, .welcome h2 {
      max-width: 540px;
      margin: 0;
      color: var(--navy-950);
      font-family: var(--serif);
      font-size: clamp(34px, 5vw, 57px);
      line-height: 1.18;
      letter-spacing: -.055em;
      word-break: keep-all;
    }

    .join-copy > p:not(.eyebrow) {
      max-width: 520px;
      margin: 22px 0 0;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.75;
      word-break: keep-all;
    }

    .join-form {
      padding: 24px;
      border: 1px solid var(--line);
      border-top: 4px solid var(--orange);
      background: var(--surface);
      box-shadow: 0 18px 50px rgba(16, 38, 63, .1);
    }

    .field-label {
      display: block;
      margin-bottom: 9px;
      color: var(--navy-950);
      font-size: 13px;
      font-weight: 800;
    }

    .name-input {
      width: 100%;
      height: 50px;
      padding: 0 14px;
      border: 1px solid var(--line-strong);
      border-radius: 8px;
      outline: none;
      color: var(--ink);
      background: #fff;
      transition: border-color .18s ease, box-shadow .18s ease;
    }

    .name-input:focus {
      border-color: var(--navy-650);
      box-shadow: 0 0 0 4px rgba(49, 89, 119, .12);
    }

    .join-button {
      width: 100%;
      min-height: 50px;
      margin-top: 12px;
      border: 0;
      border-radius: 8px;
      color: #fff;
      background: var(--navy-950);
      font-weight: 800;
      cursor: pointer;
      transition: transform .16s ease, background .16s ease;
    }

    .join-button:hover { background: var(--navy-800); transform: translateY(-1px); }
    .join-button:disabled { opacity: .55; cursor: wait; transform: none; }

    .reset-session {
      width: 100%;
      margin-top: 8px;
      padding: 8px;
      border: 0;
      color: var(--muted);
      background: transparent;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
    }

    .reset-session:hover { color: var(--navy-950); }

    .session-switch {
      min-height: 30px;
      padding: 5px 9px;
      border: 1px solid var(--line);
      border-radius: 999px;
      color: var(--navy-800);
      background: var(--surface);
      font-size: 11px;
      font-weight: 800;
      cursor: pointer;
    }

    .join-error {
      min-height: 20px;
      margin: 10px 0 0;
      color: var(--danger);
      font-size: 12px;
      line-height: 1.5;
    }

    .privacy-notice {
      display: flex;
      gap: 9px;
      margin: 16px 0 0;
      padding: 12px;
      border: 1px solid #e1ded4;
      border-radius: 8px;
      color: var(--muted);
      background: var(--paper);
      font-size: 11px;
      line-height: 1.55;
      word-break: keep-all;
    }

    .privacy-notice svg { flex: 0 0 auto; margin-top: 2px; }

    .welcome {
      padding: clamp(22px, 5vh, 52px) 0 28px;
      animation: reveal .45s ease both;
    }

    .welcome h2 { font-size: clamp(32px, 5vw, 51px); }

    .welcome-description {
      max-width: 620px;
      margin: 18px 0 0;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.75;
      word-break: keep-all;
    }

    .suggestion-label {
      margin: 34px 0 12px;
      color: var(--navy-650);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .04em;
    }

    .suggestions {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }

    .suggestion {
      position: relative;
      min-height: 118px;
      padding: 16px 16px 34px;
      border: 1px solid var(--line);
      border-radius: 10px;
      text-align: left;
      color: var(--navy-950);
      background: var(--surface);
      cursor: pointer;
      transition: border-color .16s ease, transform .16s ease, box-shadow .16s ease;
    }

    .suggestion:hover {
      border-color: var(--navy-650);
      transform: translateY(-2px);
      box-shadow: 0 10px 25px rgba(16, 38, 63, .08);
    }

    .suggestion span {
      display: block;
      font-size: 13px;
      font-weight: 750;
      line-height: 1.55;
      word-break: keep-all;
    }

    .suggestion svg {
      position: absolute;
      right: 14px;
      bottom: 13px;
      color: var(--orange);
    }

    .message-list {
      display: flex;
      flex-direction: column;
      gap: 28px;
      padding: 8px 0 34px;
    }

    .message {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr);
      gap: 13px;
      max-width: 720px;
      animation: reveal .24s ease both;
    }

    .message.me {
      grid-template-columns: minmax(0, 1fr) 34px;
      align-self: flex-end;
      width: min(88%, 680px);
    }

    .avatar {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: 10px;
      color: #fff;
      background: var(--orange);
      font-family: Georgia, serif;
      font-size: 11px;
      font-weight: 800;
    }

    .me .avatar {
      grid-column: 2;
      grid-row: 1;
      color: var(--navy-950);
      background: var(--paper-deep);
      font-family: var(--sans);
    }

    .message-content { min-width: 0; }

    .me .message-content {
      grid-column: 1;
      grid-row: 1;
    }

    .message-author {
      margin: 1px 0 7px;
      color: var(--navy-650);
      font-size: 11px;
      font-weight: 800;
    }

    .me .message-author { text-align: right; }

    .message-body {
      margin: 0;
      padding: 15px 17px;
      border: 1px solid var(--line);
      border-radius: 5px 17px 17px 17px;
      color: var(--ink);
      background: #fff;
      font-size: 15px;
      line-height: 1.72;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }

    .me .message-body {
      border-color: var(--navy-950);
      border-radius: 17px 5px 17px 17px;
      color: #fff;
      background: var(--navy-950);
    }

    .message.error .message-body {
      border-color: #efc6bb;
      color: #7d2a20;
      background: var(--danger-soft);
    }

    .message-actions {
      display: flex;
      gap: 8px;
      margin-top: 7px;
    }

    .message-action {
      padding: 4px 7px;
      border: 0;
      color: var(--muted);
      background: transparent;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
    }

    .message-action:hover { color: var(--navy-950); }

    .typing {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-width: 62px;
      min-height: 52px;
    }

    .typing i {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--navy-650);
      animation: typing 1.05s infinite ease-in-out;
    }

    .typing i:nth-child(2) { animation-delay: .14s; }
    .typing i:nth-child(3) { animation-delay: .28s; }

    .composer-wrap {
      padding: 10px clamp(20px, 4vw, 52px) max(14px, env(safe-area-inset-bottom));
      border-top: 1px solid var(--line);
      background: rgba(255, 254, 250, .94);
      backdrop-filter: blur(18px);
    }

    .composer {
      position: relative;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 44px;
      gap: 10px;
      width: min(712px, 100%);
      margin: 0 auto;
      padding: 9px 9px 9px 15px;
      border: 1px solid var(--line-strong);
      border-radius: 16px;
      background: #fff;
      box-shadow: 0 10px 30px rgba(16, 38, 63, .08);
      transition: border-color .18s ease, box-shadow .18s ease;
    }

    .composer:focus-within {
      border-color: var(--navy-650);
      box-shadow: 0 0 0 4px rgba(49, 89, 119, .1), 0 12px 34px rgba(16, 38, 63, .1);
    }

    .message-input {
      width: 100%;
      max-height: 150px;
      min-height: 42px;
      padding: 10px 0 4px;
      border: 0;
      outline: 0;
      resize: none;
      color: var(--ink);
      background: transparent;
      font-size: 14px;
      line-height: 1.5;
    }

    .message-input::placeholder { color: #92999f; }

    .send-button {
      align-self: end;
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border: 0;
      border-radius: 12px;
      color: #fff;
      background: var(--orange);
      cursor: pointer;
      transition: background .16s ease, transform .16s ease;
    }

    .send-button:hover { background: #ca4820; transform: translateY(-1px); }
    .send-button:disabled { color: #afb3b5; background: #ecebe6; cursor: not-allowed; transform: none; }

    .composer-meta {
      display: flex;
      justify-content: space-between;
      width: min(712px, 100%);
      margin: 7px auto 0;
      color: #858c91;
      font-size: 10px;
    }

    .hidden { display: none !important; }

    @keyframes reveal {
      from { opacity: 0; transform: translateY(9px); }
      to { opacity: 1; transform: none; }
    }

    @keyframes pulse {
      50% { opacity: .35; transform: scale(.8); }
    }

    @keyframes typing {
      0%, 60%, 100% { opacity: .3; transform: translateY(0); }
      30% { opacity: 1; transform: translateY(-3px); }
    }

    @media (max-width: 900px) {
      .app-shell { grid-template-columns: 220px minmax(0, 1fr); }
      .lesson-rail { padding: 28px 22px 24px; }
      .lesson-number { margin-top: 58px; }
      .lesson-rail h1 { font-size: 34px; }
      .join-card { grid-template-columns: 1fr; align-content: center; gap: 30px; }
      .join-copy h2 { max-width: 620px; }
      .join-form { max-width: 440px; }
      .suggestions { grid-template-columns: 1fr; }
      .suggestion { min-height: 78px; padding-right: 48px; }
    }

    @media (max-width: 680px) {
      body { background: var(--surface); }
      .app-shell { display: block; min-height: 100dvh; box-shadow: none; }
      .lesson-rail { display: none; }
      .workspace { min-height: 100dvh; height: 100dvh; }
      .topbar { min-height: 62px; padding: 10px 16px; }
      .mobile-brand { display: flex; align-items: center; gap: 8px; color: var(--navy-950); font-size: 12px; font-weight: 850; }
      .mobile-brand .ebs-mark { width: 38px; height: 25px; font-size: 12px; }
      .course-label { display: none; }
      .room-pill { max-width: 92px; padding: 5px 7px; }
      .turn-pill { min-width: 0; }
      .turn-pill span { display: none; }
      .status-pill { max-width: 180px; overflow: hidden; text-overflow: ellipsis; }
      .conversation-inner { padding: 28px 18px 24px; }
      .join-card { min-height: calc(100dvh - 138px); padding-bottom: 24px; }
      .join-copy h2, .welcome h2 { font-size: 36px; }
      .join-copy > p:not(.eyebrow), .welcome-description { font-size: 14px; }
      .join-form { width: 100%; max-width: none; padding: 19px; }
      .welcome { padding-top: 18px; }
      .suggestion-label { margin-top: 28px; }
      .suggestions { gap: 8px; }
      .message-list { gap: 22px; }
      .message { grid-template-columns: 30px minmax(0, 1fr); gap: 10px; }
      .message.me { grid-template-columns: minmax(0, 1fr) 30px; width: 94%; }
      .avatar { width: 30px; height: 30px; border-radius: 8px; }
      .message-body { padding: 13px 14px; font-size: 14px; }
      .composer-wrap { padding: 9px 12px max(10px, env(safe-area-inset-bottom)); }
      .composer-meta { align-items: flex-start; gap: 8px; line-height: 1.35; }
      .composer-meta > span:first-child { display: block; max-width: 250px; }
      .composer-meta > span:last-child { flex: 0 0 auto; }
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        scroll-behavior: auto !important;
        animation-duration: .01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: .01ms !important;
      }
    }
  </style>
</head>
<body>
  <div class="app-shell">
    <aside class="lesson-rail" aria-label="수업 안내">
      <div class="brand">
        <span class="ebs-mark" aria-hidden="true">EBS</span>
        <span>LEARNING STUDIO</span>
      </div>
      <p class="lesson-number">History Lab · 01</p>
      <h1>질문의 온도</h1>
      <p class="lesson-summary">대화로 생각을 넓히고, 교과서와 자료를 오가며 역사적 근거를 비교하는 수업입니다.</p>
      <hr class="rail-rule" />
      <ol class="lesson-points">
        <li><span class="point-number">01</span><span>궁금한 점을 한 문장으로 질문해 보세요.</span></li>
        <li><span class="point-number">02</span><span>답변의 핵심 주장과 근거를 구분해 보세요.</span></li>
        <li><span class="point-number">03</span><span>교과서, 검색, 친구 토론으로 다시 확인하세요.</span></li>
      </ol>
      <p class="privacy-rail">수업 대화는 교사가 수업 진행과 활동 관찰을 위해 확인할 수 있습니다.</p>
    </aside>

    <main class="workspace">
      <header class="topbar">
        <div class="mobile-brand">
          <span class="ebs-mark" aria-hidden="true">EBS</span>
          <span>EBS with ChatGPT</span>
        </div>
        <div class="course-label">임진왜란 탐구 수업</div>
        <div class="status-group">
          <button class="session-switch hidden" id="newStudent" type="button">새 학생</button>
          <span class="room-pill" id="roomStatus">수업 코드 default-classroom</span>
          <span class="turn-pill hidden" id="turnStatus" aria-live="polite">
            <strong id="turnCount">0</strong>
            <span>번의 질문을 이어가는 중</span>
          </span>
          <span class="status-pill" id="statusBadge" data-state="idle" role="status" aria-live="polite" aria-atomic="true">
            <span class="status-dot" aria-hidden="true"></span>
            <span id="status">입장 전</span>
          </span>
        </div>
      </header>

      <div class="conversation-stage" id="conversationStage">
        <div class="conversation-inner">
          <section class="join-card" id="join" aria-labelledby="joinTitle">
            <div class="join-copy">
              <p class="eyebrow">EBS with ChatGPT</p>
              <h2 id="joinTitle">질문에서 시작하는<br />역사 탐구</h2>
              <p>임진왜란 당시 조선이 침략을 막아낼 수 있었던 이유를 AI와 대화하며 살펴보세요. 답변은 그대로 받아 적기보다 다른 자료와 비교하는 데 활용합니다.</p>
            </div>
            <div class="join-form">
              <label class="field-label" for="name">수업에서 사용할 이름</label>
              <input class="name-input" id="name" maxlength="40" placeholder="이름을 입력하세요" autocomplete="name" />
              <button class="join-button" id="joinBtn" type="button">수업에 참여하기</button>
              <button class="reset-session hidden" id="resetSession" type="button">공용 기기라면 새 학생으로 시작</button>
              <p class="join-error" id="joinError" role="alert"></p>
              <p class="privacy-notice">
                <svg width="15" height="17" viewBox="0 0 15 17" fill="none" aria-hidden="true">
                  <path d="M3 7V5a4.5 4.5 0 0 1 9 0v2M2 7.5h11v8H2z" stroke="currentColor" stroke-width="1.4"/>
                </svg>
                <span>수업 활동 관찰을 위해 이름, 질문, 답변, 접속 상태가 교사용 대시보드에 기록됩니다. 이름 외 개인정보는 입력하지 마세요.</span>
              </p>
            </div>
          </section>

          <section class="welcome hidden" id="welcome" aria-labelledby="welcomeTitle">
            <p class="eyebrow">Ready to explore</p>
            <h2 id="welcomeTitle">무엇이 궁금한가요?</h2>
            <p class="welcome-description">사건의 원인, 인물의 선택, 전투의 조건을 자유롭게 물어보세요. 좋은 탐구는 답을 얻는 것보다 근거를 다시 확인하는 데서 완성됩니다.</p>
            <p class="suggestion-label">이런 질문으로 시작해 보세요</p>
            <div class="suggestions">
              <button class="suggestion" type="button" data-prompt="조선 수군이 일본 수군을 막을 수 있었던 핵심 조건은 무엇이야?">
                <span>조선 수군이 일본 수군을 막을 수 있었던 핵심 조건은 무엇이야?</span>
                <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true"><path d="M3 8.5h10M9 4l4.5 4.5L9 13" stroke="currentColor" stroke-width="1.5"/></svg>
              </button>
              <button class="suggestion" type="button" data-prompt="명량해전의 지형은 전투 결과에 어떤 영향을 주었어?">
                <span>명량해전의 지형은 전투 결과에 어떤 영향을 주었어?</span>
                <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true"><path d="M3 8.5h10M9 4l4.5 4.5L9 13" stroke="currentColor" stroke-width="1.5"/></svg>
              </button>
              <button class="suggestion" type="button" data-prompt="의병의 활동이 전쟁의 흐름을 어떻게 바꾸었는지 설명해 줘.">
                <span>의병의 활동이 전쟁의 흐름을 어떻게 바꾸었는지 설명해 줘.</span>
                <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true"><path d="M3 8.5h10M9 4l4.5 4.5L9 13" stroke="currentColor" stroke-width="1.5"/></svg>
              </button>
            </div>
          </section>

          <section class="message-list" id="chat" aria-live="polite" aria-label="수업 대화" aria-busy="false"></section>
        </div>
      </div>

      <div class="composer-wrap hidden" id="composerWrap">
        <form class="composer" id="form" aria-busy="false">
          <textarea class="message-input" id="message" maxlength="600" rows="1" placeholder="역사적 사건이나 근거에 대해 질문해 보세요" aria-label="질문 입력"></textarea>
          <button class="send-button" id="sendBtn" type="submit" aria-label="질문 보내기" disabled>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="m4 10 12-6-4 12-2.2-4.1L4 10Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
              <path d="m9.8 11.9 2.7-2.7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            </svg>
          </button>
        </form>
        <div class="composer-meta">
          <span>AI 답변은 교과서와 다른 자료로 다시 확인하세요.</span>
          <span><span id="charCount">0</span>/600</span>
        </div>
      </div>
    </main>
  </div>

  <script>
    const chat = document.querySelector("#chat");
    const form = document.querySelector("#form");
    const join = document.querySelector("#join");
    const joinBtn = document.querySelector("#joinBtn");
    const resetSessionBtn = document.querySelector("#resetSession");
    const newStudentBtn = document.querySelector("#newStudent");
    const joinError = document.querySelector("#joinError");
    const status = document.querySelector("#status");
    const statusBadge = document.querySelector("#statusBadge");
    const roomStatus = document.querySelector("#roomStatus");
    const nameInput = document.querySelector("#name");
    const messageInput = document.querySelector("#message");
    const sendBtn = document.querySelector("#sendBtn");
    const charCount = document.querySelector("#charCount");
    const turnStatus = document.querySelector("#turnStatus");
    const turnCount = document.querySelector("#turnCount");
    const welcome = document.querySelector("#welcome");
    const composerWrap = document.querySelector("#composerWrap");
    const conversationStage = document.querySelector("#conversationStage");
    const params = new URLSearchParams(location.search);
    const roomId = normalizeRoomId(params.get("room") || "default-classroom");
    const sessionKey = "ebs-session-id:" + roomId;
    const sessionSecretKey = "ebs-session-secret:" + roomId;
    const studentNameKey = "ebs-student-name:" + roomId;
    const transcriptKey = "ebs-transcript:" + roomId;
    const clientVersionKey = "ebs-client-version:" + roomId;
    if (localStorage.getItem(clientVersionKey) !== "2") {
      localStorage.removeItem(sessionKey);
      localStorage.removeItem(sessionSecretKey);
      localStorage.removeItem(studentNameKey);
      localStorage.removeItem(transcriptKey);
      localStorage.setItem(clientVersionKey, "2");
    }
    roomStatus.textContent = "수업 코드 " + roomId;
    roomStatus.title = roomId;
    let sessionId = localStorage.getItem(sessionKey) || crypto.randomUUID();
    let sessionSecret = localStorage.getItem(sessionSecretKey) || crypto.randomUUID();
    let studentName = localStorage.getItem(studentNameKey) || "";
    let conversationHistory = readStoredConversation();
    let conversationRestored = false;
    let heartbeatTimer = null;
    let heartbeatFailures = 0;
    let joining = false;
    let submitting = false;
    let completedTurns = 0;
    let historySyncId = 0;
    const joinTimeoutMs = 15000;
    const chatTimeoutMs = 105000;
    localStorage.setItem(sessionKey, sessionId);
    localStorage.setItem(sessionSecretKey, sessionSecret);
    nameInput.value = studentName;
    resetSessionBtn.classList.toggle("hidden", !studentName);

    function setConnectionState(label, state) {
      status.textContent = label;
      statusBadge.dataset.state = state;
    }

    function updateConversationProgress() {
      turnCount.textContent = String(completedTurns);
      turnStatus.classList.toggle("hidden", completedTurns === 0);
      if (completedTurns > 0) {
        messageInput.placeholder = "앞선 답변에서 더 알고 싶은 점을 이어서 물어보세요";
      }
    }

    function addMessage(role, text, options) {
      const config = options || {};
      const el = document.createElement("article");
      el.className = "message " + (role === "me" ? "me" : "bot") + (config.error ? " error" : "");

      const avatar = document.createElement("div");
      avatar.className = "avatar";
      avatar.textContent = role === "me" ? studentName.slice(0, 1) || "나" : "EBS";
      avatar.setAttribute("aria-hidden", "true");

      const content = document.createElement("div");
      content.className = "message-content";
      const author = document.createElement("p");
      author.className = "message-author";
      const turnLabel = config.turn ? " · " + config.turn + "번째 턴" : "";
      author.textContent = (role === "me" ? studentName : "EBS 학습 도우미") + turnLabel;
      const body = document.createElement("p");
      body.className = "message-body";
      body.textContent = text;

      content.append(author, body);
      el.append(avatar, content);

      if (role !== "me") {
        const actions = document.createElement("div");
        actions.className = "message-actions";
        const copyButton = document.createElement("button");
        copyButton.type = "button";
        copyButton.className = "message-action";
        copyButton.textContent = "답변 복사";
        copyButton.addEventListener("click", () => copyAnswer(copyButton, text));
        actions.appendChild(copyButton);

        if (config.retryMessage) {
          const retryButton = document.createElement("button");
          retryButton.type = "button";
          retryButton.className = "message-action";
          retryButton.textContent = "다시 질문";
          retryButton.addEventListener("click", () => {
            messageInput.value = config.retryMessage;
            updateComposer();
            messageInput.focus();
          });
          actions.appendChild(retryButton);
        }
        content.appendChild(actions);
      }

      chat.appendChild(el);
      scrollConversation(el, role !== "me");
      return el;
    }

    function readStoredConversation() {
      try {
        const stored = JSON.parse(localStorage.getItem(transcriptKey) || "[]");
        return Array.isArray(stored)
          ? stored.filter((item) =>
            (item?.role === "me" || item?.role === "bot") &&
            typeof item.text === "string" &&
            Number.isInteger(item.turn)
          ).slice(-40)
          : [];
      } catch (error) {
        return [];
      }
    }

    function storeConversation() {
      localStorage.setItem(transcriptKey, JSON.stringify(conversationHistory.slice(-40)));
    }

    function restoreConversation() {
      if (conversationRestored) return;
      conversationRestored = true;
      chat.replaceChildren();
      for (const item of conversationHistory) {
        addMessage(item.role, item.text, { turn: item.turn });
        completedTurns = Math.max(completedTurns, item.turn);
      }
      welcome.classList.toggle("hidden", completedTurns > 0);
      updateConversationProgress();
    }

    async function syncConversationFromServer() {
      if (!studentName || submitting) return;
      const syncId = ++historySyncId;
      try {
        const res = await fetchWithTimeout(withRoom("/api/history"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId, sessionSecret, studentName })
        }, joinTimeoutMs);
        const data = await readJsonSafely(res);
        if (submitting || syncId !== historySyncId || !res.ok || !Array.isArray(data.turns)) return;
        const serverHistory = data.turns.flatMap((item) => {
          const turn = Number(item.turn);
          if (!Number.isInteger(turn) ||
            typeof item.studentMessage !== "string" ||
            typeof item.studentVisibleAnswer !== "string") return [];
          return [
            { role: "me", text: item.studentMessage, turn },
            { role: "bot", text: item.studentVisibleAnswer, turn }
          ];
        }).slice(-40);
        if (JSON.stringify(serverHistory) === JSON.stringify(conversationHistory)) return;
        conversationHistory = serverHistory;
        storeConversation();
        conversationRestored = false;
        completedTurns = 0;
        restoreConversation();
      } catch (error) {
        // Heartbeat will retry; keep the locally restored transcript meanwhile.
      }
    }

    function addPendingMessage() {
      const el = document.createElement("article");
      el.className = "message bot";
      el.setAttribute("aria-label", "답변 작성 중");
      el.innerHTML = '<div class="avatar" aria-hidden="true">EBS</div><div class="message-content"><p class="message-author">EBS 학습 도우미</p><div class="message-body typing" aria-hidden="true"><i></i><i></i><i></i></div></div>';
      chat.appendChild(el);
      scrollConversation(el);
      return el;
    }

    async function copyAnswer(button, text) {
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = "복사됨";
        setTimeout(() => { button.textContent = "답변 복사"; }, 1400);
      } catch (error) {
        button.textContent = "복사 실패";
      }
    }

    function scrollConversation(target, alignToStart = false) {
      requestAnimationFrame(() => {
        const top = alignToStart && target
          ? Math.max(0, target.offsetTop - 24)
          : conversationStage.scrollHeight;
        conversationStage.scrollTo({ top, behavior: "smooth" });
      });
    }

    async function joinClass() {
      if (joining) return;
      const nextStudentName = nameInput.value.trim();
      if (!nextStudentName) {
        joinError.textContent = "이름을 입력해야 수업에 참여할 수 있습니다.";
        return nameInput.focus();
      }
      if (studentName && nextStudentName !== studentName) rotateSessionIdentity();
      joining = true;
      joinBtn.disabled = true;
      joinBtn.setAttribute("aria-busy", "true");
      joinBtn.textContent = "수업에 연결하는 중...";
      joinError.textContent = "";
      status.textContent = "입장 중";
      statusBadge.dataset.state = "loading";
      try {
        const res = await fetchWithTimeout(withRoom("/api/join"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId, sessionSecret, studentName: nextStudentName })
        }, joinTimeoutMs);
        const data = await readJsonSafely(res);
        if (!res.ok) {
          joinError.textContent = data.message || data.error || "입장 실패";
          setConnectionState("입장 실패", "error");
          return;
        }
        studentName = nextStudentName;
        localStorage.setItem(studentNameKey, studentName);
        resetSessionBtn.classList.remove("hidden");
        newStudentBtn.classList.remove("hidden");
        sendHeartbeat();
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(sendHeartbeat, 15000);
        join.classList.add("hidden");
        welcome.classList.remove("hidden");
        composerWrap.classList.remove("hidden");
        restoreConversation();
        setConnectionState(studentName + " · 접속 중", "online");
        messageInput.focus();
      } catch (error) {
        joinError.textContent = "입장 실패: 네트워크를 확인해 주세요";
        setConnectionState("연결 확인 필요", "error");
      } finally {
        joining = false;
        joinBtn.disabled = false;
        joinBtn.setAttribute("aria-busy", "false");
        joinBtn.textContent = "수업에 참여하기";
      }
    }

    async function sendHeartbeat() {
      if (!studentName) return;
      try {
        const res = await fetchWithTimeout(withRoom("/api/heartbeat"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId, sessionSecret, studentName })
        }, joinTimeoutMs);
        if (!res.ok) throw new Error("heartbeat failed");
        const recovered = heartbeatFailures > 0;
        heartbeatFailures = 0;
        await syncConversationFromServer();
        if (recovered && !submitting) setConnectionState(studentName + " · 접속 중", "online");
      } catch (error) {
        heartbeatFailures += 1;
        if (heartbeatFailures >= 2 && !submitting) setConnectionState("연결 확인 필요", "error");
      }
    }

    function updateComposer() {
      const length = messageInput.value.length;
      charCount.textContent = String(length);
      sendBtn.disabled = submitting || !messageInput.value.trim();
      messageInput.style.height = "auto";
      messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + "px";
    }

    function setSessionControlsDisabled(disabled) {
      resetSessionBtn.disabled = disabled;
      newStudentBtn.disabled = disabled;
    }

    joinBtn.addEventListener("click", joinClass);
    resetSessionBtn.addEventListener("click", resetStudentSession);
    newStudentBtn.addEventListener("click", resetStudentSession);

    function rotateSessionIdentity() {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      localStorage.removeItem(sessionKey);
      localStorage.removeItem(sessionSecretKey);
      localStorage.removeItem(studentNameKey);
      localStorage.removeItem(transcriptKey);
      sessionId = crypto.randomUUID();
      sessionSecret = crypto.randomUUID();
      studentName = "";
      conversationHistory = [];
      conversationRestored = false;
      completedTurns = 0;
      localStorage.setItem(sessionKey, sessionId);
      localStorage.setItem(sessionSecretKey, sessionSecret);
    }

    function resetStudentSession() {
      if (submitting) return;
      rotateSessionIdentity();
      nameInput.value = "";
      resetSessionBtn.classList.add("hidden");
      newStudentBtn.classList.add("hidden");
      join.classList.remove("hidden");
      welcome.classList.add("hidden");
      composerWrap.classList.add("hidden");
      chat.replaceChildren();
      updateConversationProgress();
      setConnectionState("새 학생 입장 대기", "idle");
      nameInput.focus();
    }
    nameInput.addEventListener("input", () => {
      if (joinError.textContent) joinError.textContent = "";
    });
    nameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing) joinClass();
    });
    messageInput.addEventListener("input", updateComposer);
    messageInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        form.requestSubmit();
      }
    });

    document.querySelectorAll("[data-prompt]").forEach((button) => {
      button.addEventListener("click", () => {
        messageInput.value = button.dataset.prompt;
        updateComposer();
        messageInput.focus();
      });
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submitting) return;
      const message = messageInput.value.trim();
      if (!message) return;

      submitting = true;
      historySyncId += 1;
      setSessionControlsDisabled(true);
      sendBtn.disabled = true;
      form.setAttribute("aria-busy", "true");
      chat.setAttribute("aria-busy", "true");
      messageInput.value = "";
      updateComposer();
      welcome.classList.add("hidden");
      const activeTurn = completedTurns + 1;
      addMessage("me", message, { turn: activeTurn });
      const pendingMessage = addPendingMessage();
      setConnectionState("답변 작성 중", "loading");

      try {
        const res = await fetchWithTimeout(withRoom("/api/chat"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId, sessionSecret, studentName, message })
        }, chatTimeoutMs);
        const data = await readJsonSafely(res);
        pendingMessage.remove();
        if (!res.ok) {
          addMessage("bot", studentErrorMessage(res, data), { error: true, retryMessage: message, turn: activeTurn });
          setConnectionState(studentName + " · 접속 중", "online");
          return;
        }
        if (typeof data.answer !== "string" || !data.answer.trim()) {
          addMessage("bot", "답변 형식을 확인하지 못했어. 같은 질문을 다시 보내 줘.", {
            error: true,
            retryMessage: message,
            turn: activeTurn
          });
          setConnectionState("응답 확인 필요", "error");
          return;
        }
        addMessage("bot", data.answer, { turn: activeTurn });
        conversationHistory.push(
          { role: "me", text: message, turn: activeTurn },
          { role: "bot", text: data.answer, turn: activeTurn }
        );
        storeConversation();
        completedTurns = activeTurn;
        updateConversationProgress();
        setConnectionState("앞선 대화와 연결됨", "online");
      } catch (error) {
        pendingMessage.remove();
        addMessage("bot", "네트워크 문제로 답변을 받지 못했어. 연결을 확인한 뒤 다시 물어봐.", { error: true, retryMessage: message, turn: activeTurn });
        setConnectionState("연결 확인 필요", "error");
      } finally {
        submitting = false;
        setSessionControlsDisabled(false);
        form.setAttribute("aria-busy", "false");
        chat.setAttribute("aria-busy", "false");
        updateComposer();
        messageInput.focus();
      }
    });

    async function fetchWithTimeout(url, options, timeoutMs) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, { ...options, signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
    }

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
