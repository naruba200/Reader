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
    if (typeof speechSynthesis === "undefined") {
      throw new Error("Browser speech synthesis is not available on this device");
    }

    this.stop();
    this.playing = true;
    this.voiceId = voiceId;
    if (rate !== undefined) this.rate = rate;

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = this.rate;

      // Find the voice
      const selectedId = voiceId ?? this.voiceId;
      if (selectedId) {
        const idx = parseInt(selectedId.replace("web-", ""), 10);
        const voices = speechSynthesis.getVoices();
        if (voices[idx]) utterance.voice = voices[idx];
      }

      let settled = false;
      const done = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        this.playing = false;
        if (err) reject(err);
        else {
          this.onEndCallback?.();
          resolve();
        }
      };

      // Watchdog: some WebViews (notably Android's) never fire onend/onerror,
      // which used to hang the reader's sentence loop forever with no feedback.
      // Estimate ~15 chars/sec at rate 1.0, clamped to a sane range.
      const estimatedMs = Math.min(120000, Math.max(8000, ((text.length / 15) * 1000) / this.rate));
      const watchdog = setTimeout(() => {
        console.warn("Web TTS watchdog fired — speech end event never arrived");
        done();
      }, estimatedMs);

      utterance.onend = () => done();
      utterance.onerror = (e) => {
        if (e.error === "canceled") {
          done(); // user stopped it; not a failure
        } else {
          console.warn("Web TTS error", e.error);
          done(new Error(`Speech failed (${e.error})`));
        }
      };

      try {
        speechSynthesis.speak(utterance);
      } catch (err) {
        done(err instanceof Error ? err : new Error(String(err)));
      }
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
    const { TextToSpeech } = await import("@capacitor-community/text-to-speech");

    await this.stop();
    this.playing = true;
    if (rate !== undefined) this.rate = rate;

    // Find the voice to determine language. A missing voiceId is a
    // programming error at this point (callers must pick a voice for the
    // requested language first) — fail loudly instead of guessing a
    // language and speaking gibberish with the wrong voice.
    if (!voiceId) {
      this.playing = false;
      throw new Error("No voice selected for this language");
    }
    let lang = "ja-JP";
    const voice = this.voices.find((v) => v.id === voiceId);
    if (voice) lang = voice.lang;

    try {
      await TextToSpeech.speak({
        text,
        lang,
        rate: this.rate,
        pitch: 1.0,
        volume: 1.0,
        queueStrategy: 0, // Replace
      });
    } catch (err) {
      this.playing = false;
      throw err instanceof Error ? err : new Error(String(err));
    }
    this.playing = false;
  }

  async stop() {
    try {
      const { TextToSpeech } = await import("@capacitor-community/text-to-speech");
      await TextToSpeech.stop();
    } catch { /* ignore */ }
    this.playing = false;
  }

  async pause() {
    // The Capacitor plugin has no real pause, so pausing stops playback.
    // The reader restarts the current sentence on resume.
    await this.stop();
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
  // On a real device the native TTS engine is far more reliable than the
  // WebView's speechSynthesis (which is broken or voiceless on many Android
  // WebViews), so prefer it there. A previously saved choice is always kept.
  const defaultEngineId = Capacitor.isNativePlatform() ? "native" : engines[0].id;
  activeEngineId = loadSetting(TTS_ENGINE_KEY, defaultEngineId);
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

const JAPANESE_RE = /[\u3040-\u30FF\u4E00-\u9FFF]/;

/**
 * Language for speaking a word: detected from the TEXT, not from any
 * metadata. The old code derived it from the word's JLPT level, so a
 * Japanese word with no JLPT level (most words) was spoken as "en-US" —
 * an English voice reading Japanese text, i.e. gibberish. Level is only
 * a fallback for text with no Japanese characters (e.g. a romaji headword).
 */
export function languageForText(
  text: string,
  levelHint?: string,
): "ja" | "en" {
  if (JAPANESE_RE.test(text)) return "ja";
  if (levelHint && levelHint.startsWith("N")) return "ja";
  return "en";
}

/** Shown when a Japanese word cannot be spoken because no Japanese voice exists. */
export const NO_JAPANESE_VOICE_MESSAGE =
  "No Japanese voice installed on this device. Install Japanese voice data " +
  "(Android: Settings → System → Languages → Text-to-Speech → Google " +
  "Text-to-Speech → Install voice data → Japanese), then try again.";

/**
 * Voices for a language, waiting briefly if none are known yet: engine
 * voices load asynchronously (notably the native plugin's), so a first
 * tap right after app start must not conclude "no voice" from a still
 * empty cache. Returns immediately when voices are already known.
 */
export async function waitForVoices(
  langPrefix: string,
  timeoutMs = 2000,
): Promise<TTSVoice[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const voices = getVoicesForLanguage(langPrefix);
    if (voices.length > 0 || Date.now() >= deadline) return voices;
    await new Promise((r) => setTimeout(r, 200));
  }
}
