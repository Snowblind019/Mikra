// Pronunciation: server-side neural voice (edge-tts, cached) first, browser Hebrew voice as fallback.

import { store } from "./store.js";
import { toast } from "./ui.js";
import { tr } from "./i18n.js";

let current = null;       // { audio, done } for the clip playing now
let playId = 0;           // bumped by stop(), so a stopped clip reports "aborted" instead of hanging
let serverDownUntil = 0;
let warned = false;
let browserVoices = [];

function loadVoices() {
  if (!("speechSynthesis" in window)) return;
  browserVoices = window.speechSynthesis.getVoices().filter(v => /^he|^iw/i.test(v.lang));
}
if ("speechSynthesis" in window) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

export function browserHebrewVoices() { loadVoices(); return browserVoices; }

export function stop() {
  playId++;
  if (current) {
    const c = current;
    current = null;
    try { c.audio.pause(); c.audio.removeAttribute("src"); } catch (_) { /* ignore */ }
    c.done(false);
  }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

// Resolves true when the clip finished, false when it was stopped; rejects when it could not play.
function playServer(text, slow) {
  const s = store.settings;
  const params = new URLSearchParams({ text, voice: s.voice, rate: slow ? s.slowRate : "+0%" });
  return new Promise((resolve, reject) => {
    const a = new Audio("/api/tts?" + params.toString());
    let settled = false;
    const done = (ok, err) => {
      if (settled) return;
      settled = true;
      if (current && current.audio === a) current = null;
      if (err) reject(err); else resolve(ok);
    };
    current = { audio: a, done: (ok) => done(ok) };
    a.onended = () => done(true);
    a.onerror = () => done(false, new Error("server audio failed"));
    a.play().catch((e) => done(false, e));
  });
}

function playBrowser(text, slow) {
  const id = playId;
  return new Promise((resolve, reject) => {
    if (!("speechSynthesis" in window)) return reject(new Error("no speech synthesis"));
    loadVoices();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "he-IL";
    const pref = store.settings.voice.includes("Hila") ? /hila|female|carmit/i : /avri|asaf|male/i;
    const v = browserVoices.find(x => pref.test(x.name)) || browserVoices[0];
    if (!v) return reject(new Error("no Hebrew voice"));
    u.voice = v;
    u.rate = slow ? 0.65 : 0.95;
    u.onend = () => resolve(true);
    // "interrupted" and "canceled" mean another sound or stop() took over, not that the voice is missing
    u.onerror = (e) => (id !== playId || e.error === "interrupted" || e.error === "canceled") ? resolve(false) : reject(new Error(e.error || "speech error"));
    window.speechSynthesis.speak(u);
  });
}

export async function speak(text, opts = {}) {
  text = (text || "").trim();
  if (!text) return false;
  stop();
  const id = playId;
  const engine = store.settings.audioEngine;
  // "Neural voice" always asks the server; only Automatic waits a minute after a failure before trying it again
  const tryServer = engine === "server" || (engine !== "browser" && Date.now() > serverDownUntil);
  if (tryServer) {
    try {
      return await playServer(text, opts.slow);
    } catch (e) {
      if (id !== playId || (opts.aborted && opts.aborted())) return false;
      serverDownUntil = Date.now() + 60000;
      if (engine === "server") { toast(tr("Audio did not play. Check Settings, Audio.", "Sunetul nu a pornit. Verifică Setări, Sunet.")); return false; }
    }
  }
  try {
    return await playBrowser(text, opts.slow);
  } catch (e) {
    if (id !== playId) return false;
    if (!warned) {
      warned = true;
      toast(tr("No Hebrew voice available. Settings, Audio explains how to turn it on.",
        "Nu există nicio voce ebraică. În Setări, Sunet găsești cum s-o pornești."), 4500);
    }
    return false;
  }
}

export async function testAudio() {
  serverDownUntil = 0;
  warned = false;
  return speak("שָׁלוֹם");
}
