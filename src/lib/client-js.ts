export const APP_JS = `(() => {
  window.__cc_debug = { boot: "appjs-parsed" };

  function byId(id) {
    return document.getElementById(id);
  }

  function setStatus(text, isError) {
    const el = byId("status");
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? "#8b2f2f" : "#4f6f6f";
  }

  function makeSessionId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "sess-" + Date.now() + "-" + Math.floor(Math.random() * 1e9);
  }

  function getSessionId() {
    const key = "clinic-companion-session-id";
    try {
      const existing = localStorage.getItem(key);
      if (existing) return existing;
      const created = makeSessionId();
      localStorage.setItem(key, created);
      return created;
    } catch {
      return makeSessionId();
    }
  }

  async function api(path, payload, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs || 60000);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload || {}),
        signal: controller.signal,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Request failed");
      return body;
    } finally {
      clearTimeout(timeout);
    }
  }

  function addBubble(role, text) {
    const messagesEl = byId("messages");
    if (!messagesEl) return;
    const div = document.createElement("div");
    div.className = "bubble " + role;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function bindUI() {
    const sessionId = getSessionId();

    const promptEl = byId("prompt");
    const sendBtn = byId("sendBtn");
    const saveProfileBtn = byId("saveProfile");
    const saveModeBtn = byId("saveMode");
    const triageBtn = byId("triageBtn");
    const downloadBtn = byId("downloadBtn");
    const glossaryBtn = byId("glossaryBtn");
    const refreshStateBtn = byId("refreshStateBtn");
    const resetBtn = byId("resetBtn");
    const voiceBtn = byId("voiceBtn");
    const clinicModeEl = byId("clinicMode");
    const progressPanel = byId("progressPanel");
    const resultPanel = byId("resultPanel");
    const glossaryInputEl = byId("glossaryInput");
    const glossaryPanel = byId("glossaryPanel");
    const statePanel = byId("statePanel");
    const sessionIdText = byId("sessionIdText");

    if (!promptEl || !sendBtn || !saveProfileBtn || !saveModeBtn || !triageBtn || !downloadBtn || !glossaryBtn || !refreshStateBtn || !resetBtn || !voiceBtn || !clinicModeEl || !progressPanel || !resultPanel || !glossaryInputEl || !glossaryPanel || !statePanel || !sessionIdText) {
      setStatus("UI init failed: missing elements", true);
      return;
    }

    sessionIdText.textContent = "Session: " + sessionId;

    addBubble("assistant", "Hi. I can gather symptom details, then run triage and draft a SOAP note. This is educational, not medical advice.");

    async function refreshState() {
      try {
        const body = await api("/api/state", { sessionId });
        statePanel.textContent = JSON.stringify(body.state || {}, null, 2);

        const p = body.state && body.state.profile ? body.state.profile : null;
        if (p) {
          const ageRangeEl = byId("ageRange");
          const sexEl = byId("sex");
          const conditionsEl = byId("conditions");
          const allergiesEl = byId("allergies");
          const medicationsEl = byId("medications");
          if (ageRangeEl) ageRangeEl.value = p.ageRange || "";
          if (sexEl) sexEl.value = p.sex || "";
          if (conditionsEl) conditionsEl.value = p.conditions || "";
          if (allergiesEl) allergiesEl.value = p.allergies || "";
          if (medicationsEl) medicationsEl.value = p.medications || "";
        }

        if (body.state && body.state.clinicMode) {
          clinicModeEl.value = body.state.clinicMode;
        }
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    }

    async function saveProfile() {
      try {
        setStatus("Saving profile...");
        await api("/api/profile", {
          sessionId,
          profile: {
            ageRange: (byId("ageRange")?.value || "").trim(),
            sex: (byId("sex")?.value || "").trim(),
            conditions: (byId("conditions")?.value || "").trim(),
            allergies: (byId("allergies")?.value || "").trim(),
            medications: (byId("medications")?.value || "").trim(),
          },
        });
        await refreshState();
        setStatus("Profile saved");
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    }

    async function saveMode() {
      try {
        await api("/api/mode", { sessionId, mode: clinicModeEl.value });
        await refreshState();
        setStatus("Mode saved: " + clinicModeEl.value);
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    }

    async function sendMessage() {
      const text = (promptEl.value || "").trim();
      if (!text) {
        setStatus("Type a message before sending.", true);
        return;
      }

      addBubble("user", text);
      promptEl.value = "";
      sendBtn.disabled = true;
      setStatus("Thinking...");

      try {
        const body = await api("/api/chat", { sessionId, message: text }, 90000);
        addBubble("assistant", body.reply);
        await refreshState();
        setStatus(body.memoryAvailable === false ? "Done (memory temporarily unavailable)" : "Done");
      } catch (err) {
        setStatus(err.message || String(err), true);
      } finally {
        sendBtn.disabled = false;
      }
    }

    async function runTriage() {
      triageBtn.disabled = true;
      setStatus("Running triage...");
      progressPanel.textContent = "Starting...";

      try {
        const body = await api("/api/triage", { sessionId }, 120000);
        progressPanel.textContent = (body.progress || []).join("\\n");
        resultPanel.textContent = JSON.stringify({
          draftCase: body.draftCase,
          triage: body.triage,
          soapNote: body.triage && body.triage.soapNote,
        }, null, 2);
        addBubble("assistant", "Triage complete. This is educational, not medical advice.");
        await refreshState();
        setStatus("Triage complete");
      } catch (err) {
        setStatus(err.message || String(err), true);
      } finally {
        triageBtn.disabled = false;
      }
    }

    async function downloadMarkdown() {
      try {
        const body = await api("/api/export", { sessionId });
        const blob = new Blob([body.markdown], { type: "text/markdown;charset=utf-8" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "clinic-companion-soap.md";
        link.click();
        URL.revokeObjectURL(link.href);
        setStatus("Downloaded markdown");
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    }

    async function lookupGlossary() {
      try {
        const term = (glossaryInputEl.value || "").trim();
        const body = await api("/api/glossary", { term });
        const terms = Array.isArray(body.terms) ? body.terms : [];
        const matches = Array.isArray(body.matches) ? body.matches : [];
        const matchedSet = new Set(matches.map((m) => m.term));

        const lines = [];
        lines.push("Query: " + (body.query || "(empty)"));
        lines.push("");

        if (matches.length === 0) {
          lines.push("Matches: none");
        } else {
          lines.push("Matches:");
          for (const m of matches) {
            lines.push("- " + m.term + ": " + m.definition);
          }
        }

        lines.push("");
        lines.push("All terms:");
        for (const t of terms) {
          lines.push((matchedSet.has(t) ? "* " : "- ") + t);
        }

        glossaryPanel.textContent = lines.join("\n");
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    }

    async function resetSession() {
      try {
        await api("/api/reset", { sessionId });
        byId("messages").innerHTML = "";
        addBubble("assistant", "Session cleared. Start a new intake when ready.");
        progressPanel.textContent = "No triage yet.";
        resultPanel.textContent = "Run triage to generate output.";
        await refreshState();
        setStatus("Session reset");
      } catch (err) {
        setStatus(err.message || String(err), true);
      }
    }

    function startVoice() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setStatus("Speech recognition not supported in this browser.", true);
        return;
      }
      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      setStatus("Listening...");
      recognition.start();
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        promptEl.value = promptEl.value ? promptEl.value + " " + transcript : transcript;
        setStatus("Voice captured");
      };
      recognition.onerror = (event) => {
        setStatus("Voice error: " + event.error, true);
      };
    }

    sendBtn.addEventListener("click", sendMessage);
    saveProfileBtn.addEventListener("click", saveProfile);
    saveModeBtn.addEventListener("click", saveMode);
    triageBtn.addEventListener("click", runTriage);
    downloadBtn.addEventListener("click", downloadMarkdown);
    glossaryBtn.addEventListener("click", lookupGlossary);
    refreshStateBtn.addEventListener("click", refreshState);
    resetBtn.addEventListener("click", resetSession);
    voiceBtn.addEventListener("click", startVoice);

    promptEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });

    window.__sendMessage = sendMessage;
    window.__saveProfile = saveProfile;
    window.__saveMode = saveMode;
    window.__runTriage = runTriage;
    window.__downloadMarkdown = downloadMarkdown;
    window.__lookupGlossary = lookupGlossary;
    window.__refreshState = refreshState;
    window.__resetSession = resetSession;
    window.__startVoice = startVoice;
    window.__cc_debug = { boot: "appjs-bound", sessionId };
    window.__cc_bootstrapDone = true;

    refreshState();
    setStatus("UI ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindUI);
  } else {
    bindUI();
  }

  window.addEventListener("error", (event) => {
    setStatus("UI error: " + event.message, true);
  });
})();`;
