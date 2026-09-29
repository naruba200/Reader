import { Capacitor } from "@capacitor/core";

export interface TTSVoice {
  id: string;
  name: string;
  lang: string;
  localService: boolean;
  engine: "web" | "native";
}

export interface TTSEngine {
  id: string;
  name: string;
  voices: TTSVoice[];
  speak(text: string, voiceId?: string, rate?: number): Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;
  isPlaying(): boolean;
}

const TTS_ENGINE_KEY = "smart-reader-tts-engine";
const TTS_VOICE_KEY = "smart-reader-tts-voice";
const TTS_RATE_KEY = "smart-reader-tts-rate";

function loadSetting<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

function saveSetting(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignore */ }
}

// --- Web Speech Engine ---

class WebSpeechEngine implements TTSEngine {
  readonly id = "web";
  readonly name = "Browser TTS";
  voices: TTSVoice[] = [];
  private playing = false;
  private onEndCallback?: () => void;
  private voiceId?: string;
  private rate: number;

  constructor() {
    this.rate = loadSetting(TTS_RATE_KEY, 1.0);
    this.loadVoices();
    // Some browsers load voices asynchronously
    if (typeof speechSynthesis !== "undefined") {
      speechSynthesis.onvoiceschanged = () => this.loadVoices();
    }
  }

  private loadVoices() {
    if (typeof speechSynthesis === "undefined") return;
    const raw = speechSynthesis.getVoices();
    this.voices = raw.map((v, i) => ({
      id: `web-${i}-${v.voiceURI}`,
      name: v.name,
      lang: v.lang,
      localService: v.localService,
      engine: "web" as const,
    }));
  }

  async speak(text: string, voiceId?: string, rate?: number): Promise<void> {
    if (typeof speechSynthesis === "undefined") return;

    this.stop();
    this.playing = true;
    this.voiceId = voiceId;
    if (rate !== undefined) this.rate = rate;

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = this.rate;

      // Find the voice
      const selectedId = voiceId ?? this.voiceId;
      if (selectedId) {
        const idx = parseInt(selectedId.replace("web-", ""), 10);
        const voices = speechSynthesis.getVoices();
        if (voices[idx]) utterance.voice = voices[idx];
      }

      utterance.onend = () => {
        this.playing = false;
        this.onEndCallback?.();
        resolve();
      };
      utterance.onerror = (e) => {
        if (e.error !== "canceled") console.warn("Web TTS error", e.error);
        this.playing = false;
        resolve();
      };

      this.onEndCallback?.(); // clear previous
      speechSynthesis.speak(utterance);
    });
  }

  stop() {
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    this.playing = false;
  }

  pause() {
    if (typeof speechSynthesis !== "undefined") speechSynthesis.pause();
  }

  resume() {
    if (typeof speechSynthesis !== "undefined") speechSynthesis.resume();
  }

  isPlaying() {
    return this.playing;
  }
}

// --- Capacitor Native TTS Engine ---

class CapacitorNativeEngine implements TTSEngine {
  readonly id = "native";
  readonly name = "Device TTS";
  voices: TTSVoice[] = [];
  private playing = false;
  private rate: number;

  constructor() {
    this.rate = loadSetting(TTS_RATE_KEY, 1.0);
    void this.loadVoices();
  }

  private async loadVoices() {
    try {
      const { TextToSpeech } = await import("@capacitor-community/text-to-speech");
      const result = await TextToSpeech.getSupportedVoices();
      this.voices = result.voices.map((v) => ({
        id: `native-${v.lang}-${v.name}`,
        name: v.name,
        lang: v.lang,
        localService: v.localService,
        engine: "native" as const,
      }));
    } catch {
      // Plugin not available
    }
  }

  async speak(text: string, voiceId?: string, rate?: number): Promise<void> {
    try {
      const { TextToSpeech } = await import("@capacitor-community/text-to-speech");

      this.stop();
      this.playing = true;
      if (rate !== undefined) this.rate = rate;

      // Find the voice to determine language
      let lang = "ja-JP";
      if (voiceId) {
        const voice = this.voices.find((v) => v.id === voiceId);
        if (voice) lang = voice.lang;
      }

      await TextToSpeech.speak({
        text,
        lang,
        rate: this.rate,
        pitch: 1.0,
        volume: 1.0,
        queueStrategy: 0, // Replace
      });
      this.playing = false;
    } catch (err) {
      console.warn("Native TTS error", err);
      this.playing = false;
    }
  }

  async stop() {
    try {
      const { TextToSpeech } = await import("@capacitor-community/text-to-speech");
      await TextToSpeech.stop();
    } catch { /* ignore */ }
    this.playing = false;
  }

  async pause() {
    // Capacitor TTS doesn't have pause, we stop instead
    this.playing = false;
  }

  async resume() {
    // Capacitor TTS doesn't have resume
  }

  isPlaying() {
    return this.playing;
  }
}

// --- Singleton ---

let engines: TTSEngine[] | null = null;
let activeEngineId: string | null = null;
let activeVoiceId: string | null = null;
let activeRate: number = loadSetting(TTS_RATE_KEY, 1.0);

function getEngines(): TTSEngine[] {
  if (engines) return engines;
  engines = [new WebSpeechEngine()];
  if (Capacitor.isNativePlatform()) {
    engines.push(new CapacitorNativeEngine());
  }
  activeEngineId = loadSetting(TTS_ENGINE_KEY, engines[0].id);
  activeVoiceId = loadSetting(TTS_VOICE_KEY, null);
  return engines;
}

export function getActiveEngine(): TTSEngine {
  const all = getEngines();
  const engine = all.find((e) => e.id === activeEngineId) ?? all[0];
  return engine;
}

export function getAllEngines(): TTSEngine[] {
  return getEngines();
}

export function setActiveEngine(engineId: string): void {
  activeEngineId = engineId;
  saveSetting(TTS_ENGINE_KEY, engineId);
}

export function getActiveVoiceId(): string | null {
  return activeVoiceId;
}

export function setActiveVoice(voiceId: string | null): void {
  activeVoiceId = voiceId;
  saveSetting(TTS_VOICE_KEY, voiceId);
}

export function getActiveRate(): number {
  return activeRate;
}

export function setActiveRate(rate: number): void {
  activeRate = rate;
  saveSetting(TTS_RATE_KEY, rate);
}

export function getAllVoices(): TTSVoice[] {
  const voices: TTSVoice[] = [];
  for (const engine of getEngines()) {
    voices.push(...engine.voices);
  }
  return voices;
}

export function getVoicesForLanguage(lang: string): TTSVoice[] {
  return getAllVoices().filter((v) => v.lang.startsWith(lang));
}
