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
      .hero { border-radius: 16px; color: white; padding: 20px; background: linear-gradient(120deg, #0f8b8d, #4f9d69); }
      .grid { margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 12px; }
      .fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      input, textarea, select { width: 100%; border: 1px solid var(--border); border-radius: 10px; padding: 9px; font: inherit; }
      .chat { display: flex; flex-direction: column; gap: 8px; }
      .messages { border: 1px solid var(--border); border-radius: 12px; background: #fbfdfd; height: 46vh; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
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
      .row { display: flex; gap: 8px; align-items: center; }
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
            <select id="clinicMode">
              <option value="patient_friendly">Patient-friendly mode</option>
              <option value="clinician">Clinician mode</option>
            </select>
          </div>
          <div class="actions" style="margin-top:8px;">
            <button id="saveProfile" type="button" class="secondary" onclick="window.__saveProfile && window.__saveProfile()">Save Profile</button>
            <button id="saveMode" type="button" class="secondary" onclick="window.__saveMode && window.__saveMode()">Save Mode</button>
          </div>
        </article>

        <article class="card chat">
          <h2>Chat Intake</h2>
          <div id="messages" class="messages"></div>
          <textarea id="prompt" placeholder="Describe symptoms, duration, and what worries you most."></textarea>
          <div class="actions">
            <button id="sendBtn" type="button" class="primary" onclick="window.__sendMessage && window.__sendMessage()">Send</button>
            <button id="voiceBtn" type="button" class="secondary" onclick="window.__startVoice && window.__startVoice()">Voice Input</button>
            <button id="triageBtn" type="button" class="triage" onclick="window.__runTriage && window.__runTriage()">Run Triage</button>
            <button id="downloadBtn" type="button" class="secondary" onclick="window.__downloadMarkdown && window.__downloadMarkdown()">Download SOAP .md</button>
            <button id="resetBtn" type="button" class="danger" onclick="window.__resetSession && window.__resetSession()">Reset</button>
          </div>
          <p id="status" class="status">UI ready</p>
        </article>
      </section>

      <section class="grid">
        <article class="card"><h3>Workflow Progress</h3><pre id="progressPanel">No triage yet.</pre></article>
        <article class="card"><h3>Draft Case + SOAP Output</h3><pre id="resultPanel">Run triage to generate output.</pre></article>
      </section>

      <section class="card" style="margin-top:14px;">
        <h3>Medical Glossary</h3>
        <div class="row">
          <input id="glossaryInput" placeholder="Try: triage, soap, dyspnea" />
          <button id="glossaryBtn" type="button" class="secondary" onclick="window.__lookupGlossary && window.__lookupGlossary()">Lookup</button>
        </div>
        <pre id="glossaryPanel">No lookup yet.</pre>
      </section>
    </main>

    <script>
      (function () {
        var messagesEl = document.getElementById('messages');
        var promptEl = document.getElementById('prompt');
        var sendBtn = document.getElementById('sendBtn');
        var voiceBtn = document.getElementById('voiceBtn');
        var triageBtn = document.getElementById('triageBtn');
        var downloadBtn = document.getElementById('downloadBtn');
        var resetBtn = document.getElementById('resetBtn');
        var saveProfileBtn = document.getElementById('saveProfile');
        var saveModeBtn = document.getElementById('saveMode');
        var clinicModeEl = document.getElementById('clinicMode');
        var glossaryInputEl = document.getElementById('glossaryInput');
        var glossaryBtn = document.getElementById('glossaryBtn');
        var glossaryPanel = document.getElementById('glossaryPanel');
        var progressPanel = document.getElementById('progressPanel');
        var resultPanel = document.getElementById('resultPanel');
        var statusEl = document.getElementById('status');

        function setStatus(text, isError) {
          statusEl.textContent = text;
          statusEl.style.color = isError ? '#8b2f2f' : '#4f6f6f';
        }

        function makeSessionId() {
          if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
          }
          return 'sess-' + Date.now() + '-' + Math.floor(Math.random() * 1e9);
        }

        function getSessionId() {
          var key = 'clinic-companion-session-id';
          try {
            var existing = localStorage.getItem(key);
            if (existing) return existing;
            var created = makeSessionId();
            localStorage.setItem(key, created);
            return created;
          } catch (_) {
            return makeSessionId();
          }
        }

        var sessionId = getSessionId();

        function addBubble(role, text) {
          var div = document.createElement('div');
          div.className = 'bubble ' + role;
          div.textContent = text;
          messagesEl.appendChild(div);
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        addBubble('assistant', 'Hi. I can gather symptom details, then run triage and draft a SOAP note. This is educational, not medical advice.');

        async function api(path, payload, timeoutMs) {
          var controller = new AbortController();
          var timeout = setTimeout(function () { controller.abort(); }, timeoutMs || 60000);
          try {
            var res = await fetch(path, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload || {}),
              signal: controller.signal,
            });
            var body = await res.json();
            if (!res.ok) throw new Error(body.error || 'Request failed');
            return body;
          } catch (err) {
            if (err && err.name === 'AbortError') {
              throw new Error('Request timed out.');
            }
            throw err;
          } finally {
            clearTimeout(timeout);
          }
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
          } catch (err) {
            setStatus(err.message || String(err), true);
          }
        }

        async function saveMode() {
          try {
            await api('/api/mode', { sessionId: sessionId, mode: clinicModeEl.value });
            setStatus('Mode saved: ' + clinicModeEl.value);
          } catch (err) {
            setStatus(err.message || String(err), true);
          }
        }

        async function sendMessage() {
          var text = promptEl.value.trim();
          if (!text) {
            setStatus('Type a message before sending.', true);
            return;
          }

          addBubble('user', text);
          promptEl.value = '';
          sendBtn.disabled = true;
          setStatus('Thinking...');

          try {
            var body = await api('/api/chat', { sessionId: sessionId, message: text }, 90000);
            addBubble('assistant', body.reply);
            setStatus('Done');
          } catch (err) {
            setStatus(err.message || String(err), true);
          } finally {
            sendBtn.disabled = false;
          }
        }

        async function runTriage() {
          triageBtn.disabled = true;
          setStatus('Running triage...');
          progressPanel.textContent = 'Starting...';

          try {
            var body = await api('/api/triage', { sessionId: sessionId }, 120000);
            progressPanel.textContent = (body.progress || []).join('\n');
            resultPanel.textContent = JSON.stringify({
              draftCase: body.draftCase,
              triage: body.triage,
              soapNote: body.triage && body.triage.soapNote
            }, null, 2);
            addBubble('assistant', 'Triage complete. This is educational, not medical advice.');
            setStatus('Triage complete');
          } catch (err) {
            setStatus(err.message || String(err), true);
          } finally {
            triageBtn.disabled = false;
          }
        }

        async function downloadMarkdown() {
          try {
            var body = await api('/api/export', { sessionId: sessionId });
            var blob = new Blob([body.markdown], { type: 'text/markdown;charset=utf-8' });
            var link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'clinic-companion-soap.md';
            link.click();
            URL.revokeObjectURL(link.href);
            setStatus('Downloaded markdown');
          } catch (err) {
            setStatus(err.message || String(err), true);
          }
        }

        async function lookupGlossary() {
          try {
            var term = glossaryInputEl.value.trim();
            var body = await api('/api/glossary', { term: term });
            glossaryPanel.textContent = body.definition ? (body.term + ': ' + body.definition) : ('Terms: ' + body.terms.join(', '));
          } catch (err) {
            setStatus(err.message || String(err), true);
          }
        }

        async function resetSession() {
          try {
            await api('/api/reset', { sessionId: sessionId });
            messagesEl.innerHTML = '';
            addBubble('assistant', 'Session cleared. Start a new intake when ready.');
            progressPanel.textContent = 'No triage yet.';
            resultPanel.textContent = 'Run triage to generate output.';
            setStatus('Session reset');
          } catch (err) {
            setStatus(err.message || String(err), true);
          }
        }

        function startVoice() {
          var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
          if (!SpeechRecognition) {
            setStatus('Speech recognition not supported in this browser.', true);
            return;
          }
          var recognition = new SpeechRecognition();
          recognition.lang = 'en-US';
          recognition.interimResults = false;
          recognition.maxAlternatives = 1;
          setStatus('Listening...');
          recognition.start();
          recognition.onresult = function (event) {
            var transcript = event.results[0][0].transcript;
            promptEl.value = promptEl.value ? promptEl.value + ' ' + transcript : transcript;
            setStatus('Voice captured');
          };
          recognition.onerror = function (event) {
            setStatus('Voice error: ' + event.error, true);
          };
        }

        sendBtn.addEventListener('click', sendMessage);
        saveProfileBtn.addEventListener('click', saveProfile);
        saveModeBtn.addEventListener('click', saveMode);
        triageBtn.addEventListener('click', runTriage);
        downloadBtn.addEventListener('click', downloadMarkdown);
        glossaryBtn.addEventListener('click', lookupGlossary);
        resetBtn.addEventListener('click', resetSession);
        voiceBtn.addEventListener('click', startVoice);

        promptEl.addEventListener('keydown', function (event) {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
          }
        });

        window.addEventListener('error', function (event) {
          setStatus('UI error: ' + event.message, true);
        });

        // Debug + fallback hooks for manual triggering from DevTools.
        window.__sendMessage = sendMessage;
        window.__saveProfile = saveProfile;
        window.__saveMode = saveMode;
        window.__runTriage = runTriage;
        window.__downloadMarkdown = downloadMarkdown;
        window.__lookupGlossary = lookupGlossary;
        window.__resetSession = resetSession;
        window.__startVoice = startVoice;
        window.__cc_debug = {
          sessionId: sessionId,
          hasSendBtn: !!sendBtn,
          hasPrompt: !!promptEl,
        };
      })();
    </script>
  </body>
</html>`;
