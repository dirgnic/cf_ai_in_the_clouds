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
      pre { background: #f7fbfb; border: 1px solid var(--border); border-radius: 10px; padding: 10px; max-height: 30vh; overflow: auto; margin: 8px 0 0; }
      @media (max-width: 900px) {
        .grid { grid-template-columns: 1fr; }
        .messages { height: 38vh; }
        .fields { grid-template-columns: 1fr; }
      }
    </style>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  </head>
  <body>
    <div id="root"></div>

    <script type="text/babel">
      const { useMemo, useState } = React;

      function createSessionId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
        return 'sess-' + Date.now() + '-' + Math.floor(Math.random() * 1e9);
      }

      function getSessionId() {
        const key = 'clinic-companion-session-id';
        try {
          const existing = localStorage.getItem(key);
          if (existing) return existing;
          const id = createSessionId();
          localStorage.setItem(key, id);
          return id;
        } catch {
          return createSessionId();
        }
      }

      async function api(path, payload, timeoutMs = 60000) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(path, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          const body = await res.json();
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

      function App() {
        const sessionId = useMemo(getSessionId, []);
        const [status, setStatus] = useState('UI ready');
        const [messages, setMessages] = useState([
          { role: 'assistant', text: 'Hi. I can gather symptom details, then run triage and draft a SOAP note. This is educational, not medical advice.' },
        ]);
        const [prompt, setPrompt] = useState('');
        const [progress, setProgress] = useState('No triage yet.');
        const [result, setResult] = useState('Run triage to generate output.');
        const [glossary, setGlossary] = useState('No lookup yet.');
        const [busy, setBusy] = useState(false);
        const [profile, setProfile] = useState({ ageRange: '', sex: '', conditions: '', allergies: '', medications: '' });
        const [mode, setMode] = useState('patient_friendly');

        const onSend = async () => {
          const text = prompt.trim();
          if (!text) {
            setStatus('Type a message before sending.');
            return;
          }
          setMessages((prev) => [...prev, { role: 'user', text }]);
          setPrompt('');
          setBusy(true);
          setStatus('Thinking...');
          try {
            const body = await api('/api/chat', { sessionId, message: text }, 90000);
            setMessages((prev) => [...prev, { role: 'assistant', text: body.reply }]);
            setStatus('Done');
          } catch (e) {
            setStatus(e.message || String(e));
          } finally {
            setBusy(false);
          }
        };

        const onSaveProfile = async () => {
          try {
            setStatus('Saving profile...');
            await api('/api/profile', { sessionId, profile });
            setStatus('Profile saved');
          } catch (e) {
            setStatus(e.message || String(e));
          }
        };

        const onSaveMode = async () => {
          try {
            await api('/api/mode', { sessionId, mode });
            setStatus('Mode saved: ' + mode);
          } catch (e) {
            setStatus(e.message || String(e));
          }
        };

        const onRunTriage = async () => {
          setBusy(true);
          setStatus('Running triage...');
          setProgress('Starting...');
          try {
            const body = await api('/api/triage', { sessionId }, 120000);
            setProgress((body.progress || []).join('\n'));
            setResult(JSON.stringify({ draftCase: body.draftCase, triage: body.triage, soapNote: body.triage?.soapNote }, null, 2));
            setMessages((prev) => [...prev, { role: 'assistant', text: 'Triage complete. This is educational, not medical advice.' }]);
            setStatus('Triage complete');
          } catch (e) {
            setStatus(e.message || String(e));
          } finally {
            setBusy(false);
          }
        };

        const onReset = async () => {
          try {
            await api('/api/reset', { sessionId });
            setMessages([{ role: 'assistant', text: 'Session cleared. Start a new intake when ready.' }]);
            setProgress('No triage yet.');
            setResult('Run triage to generate output.');
            setStatus('Session reset');
          } catch (e) {
            setStatus(e.message || String(e));
          }
        };

        const onLookupGlossary = async () => {
          try {
            const term = prompt.trim();
            const body = await api('/api/glossary', { term });
            if (body.definition) setGlossary(body.term + ': ' + body.definition);
            else setGlossary('Terms: ' + (body.terms || []).join(', '));
          } catch (e) {
            setStatus(e.message || String(e));
          }
        };

        const onDownload = async () => {
          try {
            const body = await api('/api/export', { sessionId });
            const blob = new Blob([body.markdown], { type: 'text/markdown;charset=utf-8' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'clinic-companion-soap.md';
            link.click();
            URL.revokeObjectURL(link.href);
            setStatus('Downloaded markdown');
          } catch (e) {
            setStatus(e.message || String(e));
          }
        };

        const onVoice = () => {
          const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
          if (!SpeechRecognition) {
            setStatus('Speech recognition not supported in this browser.');
            return;
          }
          const recognition = new SpeechRecognition();
          recognition.lang = 'en-US';
          recognition.interimResults = false;
          recognition.maxAlternatives = 1;
          setStatus('Listening...');
          recognition.start();
          recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setPrompt((prev) => (prev ? prev + ' ' + transcript : transcript));
            setStatus('Voice captured');
          };
          recognition.onerror = (event) => setStatus('Voice error: ' + event.error);
        };

        return (
          <main className="container">
            <section className="hero">
              <h1>Clinic Companion</h1>
              <p>AI intake + triage + SOAP note draft. Educational only, not medical advice.</p>
            </section>

            <section className="grid">
              <article className="card">
                <h2>Profile Memory</h2>
                <div className="fields">
                  <input placeholder="Age range" value={profile.ageRange} onChange={(e) => setProfile({ ...profile, ageRange: e.target.value })} />
                  <input placeholder="Sex" value={profile.sex} onChange={(e) => setProfile({ ...profile, sex: e.target.value })} />
                  <input placeholder="Conditions" value={profile.conditions} onChange={(e) => setProfile({ ...profile, conditions: e.target.value })} />
                  <input placeholder="Allergies" value={profile.allergies} onChange={(e) => setProfile({ ...profile, allergies: e.target.value })} />
                  <input placeholder="Medications" value={profile.medications} onChange={(e) => setProfile({ ...profile, medications: e.target.value })} />
                  <select value={mode} onChange={(e) => setMode(e.target.value)}>
                    <option value="patient_friendly">Patient-friendly mode</option>
                    <option value="clinician">Clinician mode</option>
                  </select>
                </div>
                <div className="actions" style={{ marginTop: 8 }}>
                  <button className="secondary" onClick={onSaveProfile}>Save Profile</button>
                  <button className="secondary" onClick={onSaveMode}>Save Mode</button>
                </div>
              </article>

              <article className="card chat">
                <h2>Chat Intake</h2>
                <div className="messages">
                  {messages.map((m, i) => (
                    <div key={i} className={'bubble ' + m.role}>{m.text}</div>
                  ))}
                </div>
                <textarea
                  placeholder="Describe symptoms, duration, and what worries you most."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      onSend();
                    }
                  }}
                />
                <div className="actions">
                  <button className="primary" disabled={busy} onClick={onSend}>Send</button>
                  <button className="secondary" onClick={onVoice}>Voice Input</button>
                  <button className="triage" disabled={busy} onClick={onRunTriage}>Run Triage</button>
                  <button className="secondary" onClick={onDownload}>Download SOAP .md</button>
                  <button className="danger" onClick={onReset}>Reset</button>
                </div>
                <p className="status">{status}</p>
              </article>
            </section>

            <section className="grid">
              <article className="card"><h3>Workflow Progress</h3><pre>{progress}</pre></article>
              <article className="card"><h3>Draft Case + SOAP Output</h3><pre>{result}</pre></article>
            </section>

            <section className="card" style={{ marginTop: 14 }}>
              <h3>Medical Glossary</h3>
              <div className="actions">
                <button className="secondary" onClick={onLookupGlossary}>Lookup Prompt Term</button>
              </div>
              <pre>{glossary}</pre>
            </section>
          </main>
        );
      }

      ReactDOM.createRoot(document.getElementById('root')).render(<App />);
    </script>
  </body>
</html>`;
