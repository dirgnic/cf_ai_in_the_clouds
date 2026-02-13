import { Agent } from "agents";
import { CHAT_SYSTEM_PROMPT } from "./constants";
import { callModel } from "./ai";
import { defaultState, normalizeProfile } from "./validation";
import type { Env, Profile, SessionState } from "./types";

export class ClinicAgent extends Agent<Env, SessionState> {
  initialState = defaultState();

  async chat(message: string): Promise<string> {
    const state = this.state || defaultState();
    const reply = await callModel(this.env, [
      { role: "system", content: CHAT_SYSTEM_PROMPT },
      ...state.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: message },
    ]);

    const timestamp = new Date().toISOString();
    this.setState({
      ...state,
      history: [...state.history, { role: "user", content: message, timestamp }, { role: "assistant", content: reply, timestamp }].slice(-40),
    });

    return reply;
  }

  async setProfile(profile: Partial<Profile>): Promise<void> {
    const state = this.state || defaultState();
    this.setState({
      ...state,
      profile: { ...state.profile, ...normalizeProfile(profile) },
    });
  }

  async setMode(mode: SessionState["clinicMode"]): Promise<void> {
    const state = this.state || defaultState();
    this.setState({
      ...state,
      clinicMode: mode === "clinician" ? "clinician" : "patient_friendly",
    });
  }
}
