export const APP_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Clinic Companion</title>
    <style>
      :root {
        --bg: #f4f8f7;
        --surface: #ffffff;
        --ink: #0d2f2f;
        --muted: #4f6f6f;
        --accent: #0f8b8d;
        --border: #d8e4e2;
        --warning: #8b2f2f;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Avenir Next", "Segoe UI", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at 20% 0%, #d7edec 0, transparent 32%),
          radial-gradient(circle at 90% 100%, #d8e9d8 0, transparent 30%),
          var(--bg);
      }
      .container { max-width: 1080px; margin: 0 auto; padding: 16px; }
      .hero {
        border-radius: 16px;
        color: white;
        padding: 20px;
        background: linear-gradient(120deg, #0f8b8d, #4f9d69);
      }
      .grid { margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 12px; }
      .fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      input, textarea { width: 100%; border: 1px solid var(--border); border-radius: 10px; padding: 9px; font: inherit; }
      .chat { display: flex; flex-direction: column; gap: 8px; }
      .messages {
        border: 1px solid var(--border);
        border-radius: 12px;
        background: #fbfdfd;
        height: 46vh;
        overflow-y: auto;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .bubble { max-width: 86%; padding: 9px 11px; border-radius: 11px; white-space: pre-wrap; line-height: 1.4; }
      .user { align-self: flex-end; background: #e2f5f6; border: 1px solid #bde4e4; }
      .assistant { align-self: flex-start; background: #f4f9f6; border: 1px solid #d8ebe0; }
      .actions { display: flex; gap: 8px; flex-wrap: wrap; }
      button { border: 0; border-radius: 10px; padding: 10px 12px; font-weight: 700; cursor: pointer; }
      .primary { background: var(--accent); color: #fff; }
      .secondary { background: #eaf2f2; color: var(--ink); }
      .triage { background: #e9f3ea; color: #184f2d; }
      .danger { background: #f7e6e6; color: var(--warning); }
      .status { color: var(--muted); min-height: 20px; }
      pre { background: #f7fbfb; border: 1px solid var(--border); border-radius: 10px; padding: 10px; max-height: 30vh; overflow: auto; margin: 8px 0 0; }
      @media (max-width: 900px) {
        .grid { grid-template-columns: 1fr; }
        .messages { height: 38vh; }
        .fields { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main class="container">
      <section class="hero">
        <h1>Clinic Companion</h1>
        <p>AI intake + triage + SOAP note draft. Educational only, not medical advice.</p>
      </section>

      <section class="grid">
        <article class="card">
          <h2>Profile Memory</h2>
          <div class="fields">
            <input id="ageRange" placeholder="Age range (e.g. 25-34)" />
            <input id="sex" placeholder="Sex" />
            <input id="conditions" placeholder="Conditions" />
            <input id="allergies" placeholder="Allergies" />
            <input id="medications" placeholder="Medications" />
          </div>
          <div class="actions" style="margin-top:8px;"><button id="saveProfile" class="secondary">Save Profile</button></div>
        </article>

        <article class="card chat">
          <h2>Chat Intake</h2>
          <div id="messages" class="messages"></div>
          <textarea id="prompt" placeholder="Describe symptoms, duration, and what worries you most."></textarea>
          <div class="actions">
            <button id="sendBtn" class="primary">Send</button>
            <button id="voiceBtn" class="secondary">Voice Input</button>
            <button id="triageBtn" class="triage">Run Triage</button>
            <button id="resetBtn" class="danger">Reset</button>
          </div>
          <p id="status" class="status"></p>
        </article>
      </section>

      <section class="grid">
        <article class="card"><h3>Workflow Progress</h3><pre id="progressPanel">No triage yet.</pre></article>
        <article class="card"><h3>Draft Case + SOAP Output</h3><pre id="resultPanel">Run triage to generate output.</pre></article>
      </section>
    </main>

    <script>
      var messages = document.getElementById('messages');
      var prompt = document.getElementById('prompt');
      var sendBtn = document.getElementById('sendBtn');
      var voiceBtn = document.getElementById('voiceBtn');
      var triageBtn = document.getElementById('triageBtn');
      var resetBtn = document.getElementById('resetBtn');
      var saveProfileBtn = document.getElementById('saveProfile');
      var statusEl = document.getElementById('status');
      var progressPanel = document.getElementById('progressPanel');
      var resultPanel = document.getElementById('resultPanel');

      var sessionIdKey = 'clinic-companion-session-id';
      var sessionId = localStorage.getItem(sessionIdKey);
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        localStorage.setItem(sessionIdKey, sessionId);
      }

      addBubble('assistant', 'Hi. I can gather symptom details, then run triage and draft a SOAP note. This is educational, not medical advice.');

      sendBtn.addEventListener('click', sendMessage);
      triageBtn.addEventListener('click', runTriage);
      resetBtn.addEventListener('click', resetAll);
      saveProfileBtn.addEventListener('click', saveProfile);
      voiceBtn.addEventListener('click', startVoice);

      prompt.addEventListener('keydown', function(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          sendMessage();
        }
      });

      async function api(path, payload) {
        var res = await fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        var body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Request failed');
        return body;
      }

      async function saveProfile() {
        try {
          setStatus('Saving profile...');
          await api('/api/profile', {
            sessionId: sessionId,
            profile: {
              ageRange: document.getElementById('ageRange').value.trim(),
              sex: document.getElementById('sex').value.trim(),
              conditions: document.getElementById('conditions').value.trim(),
              allergies: document.getElementById('allergies').value.trim(),
              medications: document.getElementById('medications').value.trim()
            }
          });
          setStatus('Profile saved');
        } catch (error) {
          setStatus(error.message || String(error), true);
        }
      }

      async function sendMessage() {
        var text = prompt.value.trim();
        if (!text) return;
        addBubble('user', text);
        prompt.value = '';
        sendBtn.disabled = true;
        setStatus('Thinking...');

        try {
          var body = await api('/api/chat', { sessionId: sessionId, message: text });
          addBubble('assistant', body.reply);
          setStatus('Done');
        } catch (error) {
          setStatus(error.message || String(error), true);
        } finally {
          sendBtn.disabled = false;
        }
      }

      async function runTriage() {
        triageBtn.disabled = true;
        setStatus('Running triage workflow...');
        progressPanel.textContent = 'Starting...';

        try {
          var body = await api('/api/triage', { sessionId: sessionId });
          progressPanel.textContent = body.progress.join('\n');
          resultPanel.textContent = JSON.stringify({
            draftCase: body.draftCase,
            triage: {
              recommendation: body.triage.recommendation,
              reason: body.triage.reason,
              redFlags: body.triage.redFlags,
              generatedAt: body.triage.generatedAt
            },
            soapNote: body.triage.soapNote
          }, null, 2);
          addBubble('assistant', 'Triage complete. This is educational, not medical advice.');
          setStatus('Triage complete');
        } catch (error) {
          setStatus(error.message || String(error), true);
        } finally {
          triageBtn.disabled = false;
        }
      }

      async function resetAll() {
        try {
          await api('/api/reset', { sessionId: sessionId });
          messages.innerHTML = '';
          progressPanel.textContent = 'No triage yet.';
          resultPanel.textContent = 'Run triage to generate output.';
          addBubble('assistant', 'Session cleared. Start a new intake when ready.');
          setStatus('Session reset');
        } catch (error) {
          setStatus(error.message || String(error), true);
        }
      }

      function startVoice() {
        var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
          setStatus('Speech recognition is not supported in this browser.', true);
          return;
        }
        var recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        setStatus('Listening...');
        recognition.start();
        recognition.onresult = function(event) {
          var transcript = event.results[0][0].transcript;
          prompt.value = prompt.value ? prompt.value + ' ' + transcript : transcript;
          setStatus('Voice captured');
        };
        recognition.onerror = function(event) {
          setStatus('Voice error: ' + event.error, true);
        };
      }

      function addBubble(role, text) {
        var div = document.createElement('div');
        div.className = 'bubble ' + role;
        div.textContent = text;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
      }

      function setStatus(text, warn) {
        statusEl.textContent = text;
        statusEl.style.color = warn ? '#8b2f2f' : '#4f6f6f';
      }
    </script>
  </body>
</html>`;
