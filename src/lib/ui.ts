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
      pre { background: #f7fbfb; border: 1px solid var(--border); border-radius: 10px; padding: 10px; max-height: 30vh; overflow: auto; margin: 8px 0 0; }
      @media (max-width: 900px) {
        .grid { grid-template-columns: 1fr; }
        .messages { height: 38vh; }
        .fields { grid-template-columns: 1fr; }
      }
    </style>
    <script defer src="/app.js?v=1"></script>
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
