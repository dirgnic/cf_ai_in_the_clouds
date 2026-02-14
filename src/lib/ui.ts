export const APP_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="app-build" content="ui-external-js-v1" />
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
      pre {
        background: #f7fbfb;
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 10px;
        max-height: 30vh;
        max-width: 100%;
        overflow: auto;
        margin: 8px 0 0;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      @media (max-width: 900px) {
        .grid { grid-template-columns: 1fr; }
        .messages { height: 38vh; }
        .fields { grid-template-columns: 1fr; }
      }
    </style>
    <script defer src="/app.js?v=2"></script>
    <script>
      (function () {
        function byId(id) { return document.getElementById(id); }
        function setStatus(text, isError) {
          var el = byId("status");
          if (!el) return;
          el.textContent = text;
          el.style.color = isError ? "#8b2f2f" : "#4f6f6f";
        }
        function makeSessionId() {
          return "sess-" + Date.now() + "-" + Math.floor(Math.random() * 1e9);
        }
        function getSessionId() {
          var key = "clinic-companion-session-id";
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
        function addBubble(role, text) {
          var messages = byId("messages");
          if (!messages) return;
          var div = document.createElement("div");
          div.className = "bubble " + role;
          div.textContent = text;
          messages.appendChild(div);
          messages.scrollTop = messages.scrollHeight;
        }
        function fallbackBootstrap() {
          if (window.__cc_bootstrapDone) return;
          var sendBtn = byId("sendBtn");
          var saveProfileBtn = byId("saveProfile");
          var saveModeBtn = byId("saveMode");
          var triageBtn = byId("triageBtn");
          var downloadBtn = byId("downloadBtn");
          var glossaryBtn = byId("glossaryBtn");
          var refreshStateBtn = byId("refreshStateBtn");
          var resetBtn = byId("resetBtn");
          var voiceBtn = byId("voiceBtn");
          var prompt = byId("prompt");
          var clinicModeEl = byId("clinicMode");
          var glossaryInputEl = byId("glossaryInput");
          var glossaryPanel = byId("glossaryPanel");
          var progressPanel = byId("progressPanel");
          var resultPanel = byId("resultPanel");
          var statePanel = byId("statePanel");
          var sessionIdText = byId("sessionIdText");
          if (!sendBtn || !prompt || !saveProfileBtn || !saveModeBtn || !triageBtn || !downloadBtn || !glossaryBtn || !refreshStateBtn || !resetBtn || !voiceBtn || !clinicModeEl || !glossaryInputEl || !glossaryPanel || !progressPanel || !resultPanel || !statePanel || !sessionIdText) {
            setStatus("UI failed to initialize.", true);
            return;
          }
          var sessionId = getSessionId();
          sessionIdText.textContent = "Session: " + sessionId;

          function api(path, payload, timeoutMs) {
            var controller = new AbortController();
            var timeout = setTimeout(function () { controller.abort(); }, timeoutMs || 90000);
            return fetch(path, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload || {}),
              signal: controller.signal
            })
              .then(function (r) {
                return r.json().then(function (b) {
                  if (!r.ok) throw new Error((b && b.error) || "Request failed");
                  return b;
                });
              })
              .finally(function () {
                clearTimeout(timeout);
              });
          }

          window.__refreshState = function () {
            return api("/api/state", { sessionId: sessionId }, 60000)
              .then(function (body) {
                statePanel.textContent = JSON.stringify(body.state || {}, null, 2);
                if (body.state && body.state.clinicMode) {
                  clinicModeEl.value = body.state.clinicMode;
                }
              })
              .catch(function (err) {
                setStatus(err && err.message ? err.message : String(err), true);
              });
          };

          window.__saveProfile = function () {
            setStatus("Saving profile...");
            return api("/api/profile", {
              sessionId: sessionId,
              profile: {
                ageRange: (byId("ageRange") && byId("ageRange").value || "").trim(),
                sex: (byId("sex") && byId("sex").value || "").trim(),
                conditions: (byId("conditions") && byId("conditions").value || "").trim(),
                allergies: (byId("allergies") && byId("allergies").value || "").trim(),
                medications: (byId("medications") && byId("medications").value || "").trim()
              }
            }, 60000)
              .then(function () { return window.__refreshState(); })
              .then(function () { setStatus("Profile saved (fallback mode)"); })
              .catch(function (err) { setStatus(err && err.message ? err.message : String(err), true); });
          };

          window.__saveMode = function () {
            return api("/api/mode", { sessionId: sessionId, mode: clinicModeEl.value }, 60000)
              .then(function () { return window.__refreshState(); })
              .then(function () { setStatus("Mode saved: " + clinicModeEl.value + " (fallback mode)"); })
              .catch(function (err) { setStatus(err && err.message ? err.message : String(err), true); });
          };

          window.__sendMessage = function () {
            var text = (prompt.value || "").trim();
            if (!text) {
              setStatus("Type a message before sending.", true);
              return;
            }
            setStatus("Thinking...");
            sendBtn.disabled = true;
            api("/api/chat", { sessionId: sessionId, message: text }, 90000)
              .then(function (res) {
                addBubble("user", text);
                addBubble("assistant", res.reply || "(no reply)");
                prompt.value = "";
                return window.__refreshState();
              })
              .then(function () {
                setStatus("Done (fallback mode)");
              })
              .catch(function (err) {
                setStatus(err && err.message ? err.message : String(err), true);
              })
              .finally(function () {
                sendBtn.disabled = false;
              });
          };

          window.__runTriage = function () {
            triageBtn.disabled = true;
            setStatus("Running triage...");
            progressPanel.textContent = "Starting...";
            return api("/api/triage", { sessionId: sessionId }, 120000)
              .then(function (body) {
                progressPanel.textContent = (body.progress || []).join("\\n");
                resultPanel.textContent = JSON.stringify({
                  draftCase: body.draftCase,
                  triage: body.triage,
                  soapNote: body.triage && body.triage.soapNote
                }, null, 2);
                addBubble("assistant", "Triage complete. This is educational, not medical advice.");
                return window.__refreshState();
              })
              .then(function () {
                setStatus("Triage complete (fallback mode)");
              })
              .catch(function (err) {
                setStatus(err && err.message ? err.message : String(err), true);
              })
              .finally(function () {
                triageBtn.disabled = false;
              });
          };

          window.__downloadMarkdown = function () {
            return api("/api/export", { sessionId: sessionId }, 60000)
              .then(function (body) {
                var blob = new Blob([body.markdown], { type: "text/markdown;charset=utf-8" });
                var link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = "clinic-companion-soap.md";
                link.click();
                URL.revokeObjectURL(link.href);
                setStatus("Downloaded markdown (fallback mode)");
              })
              .catch(function (err) {
                setStatus(err && err.message ? err.message : String(err), true);
              });
          };

          window.__lookupGlossary = function () {
            var term = (glossaryInputEl.value || "").trim();
            return api("/api/glossary", { term: term }, 60000)
              .then(function (body) {
                var terms = Array.isArray(body.terms) ? body.terms : [];
                var matches = Array.isArray(body.matches) ? body.matches : [];
                var matchedSet = {};
                for (var i = 0; i < matches.length; i++) matchedSet[matches[i].term] = true;
                var lines = [];
                lines.push("Query: " + (body.query || "(empty)"));
                lines.push("");
                if (matches.length === 0) {
                  lines.push("Matches: none");
                } else {
                  lines.push("Matches:");
                  for (var j = 0; j < matches.length; j++) {
                    lines.push("- " + matches[j].term + ": " + matches[j].definition);
                  }
                }
                lines.push("");
                lines.push("All terms:");
                for (var k = 0; k < terms.length; k++) {
                  lines.push((matchedSet[terms[k]] ? "* " : "- ") + terms[k]);
                }
                glossaryPanel.textContent = lines.join("\\n");
              })
              .catch(function (err) {
                setStatus(err && err.message ? err.message : String(err), true);
              });
          };

          window.__resetSession = function () {
            return api("/api/reset", { sessionId: sessionId }, 60000)
              .then(function () {
                var messages = byId("messages");
                if (messages) messages.innerHTML = "";
                addBubble("assistant", "Session cleared. Start a new intake when ready.");
                progressPanel.textContent = "No triage yet.";
                resultPanel.textContent = "Run triage to generate output.";
                return window.__refreshState();
              })
              .then(function () {
                setStatus("Session reset (fallback mode)");
              })
              .catch(function (err) {
                setStatus(err && err.message ? err.message : String(err), true);
              });
          };

          window.__startVoice = function () {
            var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
              setStatus("Speech recognition not supported in this browser.", true);
              return;
            }
            var recognition = new SpeechRecognition();
            recognition.lang = "en-US";
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;
            setStatus("Listening...");
            recognition.start();
            recognition.onresult = function (event) {
              var transcript = event.results[0][0].transcript;
              prompt.value = prompt.value ? prompt.value + " " + transcript : transcript;
              setStatus("Voice captured");
            };
            recognition.onerror = function (event) {
              setStatus("Voice error: " + event.error, true);
            };
          };

          sendBtn.addEventListener("click", window.__sendMessage);
          saveProfileBtn.addEventListener("click", window.__saveProfile);
          saveModeBtn.addEventListener("click", window.__saveMode);
          triageBtn.addEventListener("click", window.__runTriage);
          downloadBtn.addEventListener("click", window.__downloadMarkdown);
          glossaryBtn.addEventListener("click", window.__lookupGlossary);
          refreshStateBtn.addEventListener("click", window.__refreshState);
          resetBtn.addEventListener("click", window.__resetSession);
          voiceBtn.addEventListener("click", window.__startVoice);
          prompt.addEventListener("keydown", function (event) {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              window.__sendMessage();
            }
          });
          window.__refreshState();
          setStatus("UI fallback active");
        }
        window.addEventListener("load", function () {
          setTimeout(fallbackBootstrap, 700);
        });
      })();
    </script>
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
            <button id="saveProfile" type="button" class="secondary">Save Profile</button>
            <button id="saveMode" type="button" class="secondary">Save Mode</button>
          </div>
        </article>

        <article class="card chat">
          <h2>Chat Intake</h2>
          <div id="messages" class="messages"></div>
          <textarea id="prompt" placeholder="Describe symptoms, duration, and what worries you most."></textarea>
          <div class="actions">
            <button id="sendBtn" type="button" class="primary">Send</button>
            <button id="voiceBtn" type="button" class="secondary">Voice Input</button>
            <button id="triageBtn" type="button" class="triage">Run Triage</button>
            <button id="downloadBtn" type="button" class="secondary">Download SOAP .md</button>
            <button id="resetBtn" type="button" class="danger">Reset</button>
          </div>
          <p id="status" class="status">Loading UI...</p>
        </article>
      </section>

      <section class="grid">
        <article class="card"><h3>Workflow Progress</h3><pre id="progressPanel">No triage yet.</pre></article>
        <article class="card"><h3>Draft Case + SOAP Output</h3><pre id="resultPanel">Run triage to generate output.</pre></article>
      </section>

      <section class="card" style="margin-top:14px;">
        <h3>Session State View</h3>
        <div class="actions">
          <button id="refreshStateBtn" type="button" class="secondary">Refresh Session State</button>
          <span class="status" id="sessionIdText"></span>
        </div>
        <pre id="statePanel">No state loaded yet.</pre>
      </section>

      <section class="card" style="margin-top:14px;">
        <h3>Medical Glossary</h3>
        <div class="row">
          <input id="glossaryInput" placeholder="Try: triage, soap, dyspnea" />
          <button id="glossaryBtn" type="button" class="secondary">Lookup</button>
        </div>
        <pre id="glossaryPanel">No lookup yet.</pre>
      </section>
    </main>
  </body>
</html>`;
