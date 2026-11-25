import { gainFor, pickSource, type FocusSound } from "@/lib/focus/sounds";

/** Fade when the sound changes, starts or pauses. */
export const FADE_MS = 400;

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/**
 * Ambient sound on Web Audio: loops without a gap between two points of the buffer and fades in
 * and out. Knows nothing about the timer or React.
 */
export class AmbientPlayer {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private voice: Voice | null = null;
  private volume = 60;
  /** Only the current sound stays decoded: each one takes tens of MB. */
  private loaded: { sound: FocusSound; buffer: AudioBuffer } | null = null;
  /** The last request wins: an older download that arrives late is ignored. */
  private request = 0;

  constructor(private readonly onPlaying: (playing: boolean) => void) {}

  /** iOS only lets sound out after a gesture: call from a tap. */
  unlock(): void {
    if (!this.context) {
      const Context = window.AudioContext;
      if (!Context) return;
      this.context = new Context();
      this.master = this.context.createGain();
      this.master.gain.value = gainFor(this.volume);
      this.master.connect(this.context.destination);
      this.context.onstatechange = () => this.report();
    }
    if (this.context.state !== "running") void this.context.resume().catch(() => {});
  }

  get unlocked(): boolean {
    return this.context?.state === "running";
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(gainFor(volume), this.context.currentTime, 0.02);
    }
  }

  async play(sound: FocusSound): Promise<void> {
    const context = this.context;
    if (!context || !this.master) return;
    const request = ++this.request;
    if (this.loaded?.sound !== sound) {
      const buffer = await this.load(context, sound);
      if (request !== this.request) return;
      this.loaded = { sound, buffer };
    } else if (this.voice) return; // Already playing it.

    this.fadeOut();
    const source = context.createBufferSource();
    source.buffer = this.loaded.buffer;
    source.loop = true;
    source.loopStart = sound.loopStart;
    source.loopEnd = Math.min(sound.loopEnd, this.loaded.buffer.duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(1, context.currentTime + FADE_MS / 1000);
    source.connect(gain).connect(this.master);
    source.start(0, sound.loopStart);
    this.voice = { source, gain };
    this.report();
  }

  stop(): void {
    this.request++;
    this.fadeOut();
    this.report();
  }

  /** Lets go of everything (leaving the screen). */
  close(): void {
    this.stop();
    const context = this.context;
    this.context = this.master = this.loaded = null;
    if (context) {
      context.onstatechange = null;
      setTimeout(() => void context.close().catch(() => {}), FADE_MS + 50);
    }
  }

  private fadeOut(): void {
    const { context, voice } = this;
    this.voice = null;
    if (!context || !voice) return;
    const now = context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + FADE_MS / 1000);
    voice.source.stop(now + FADE_MS / 1000 + 0.02);
  }

  private async load(context: AudioContext, sound: FocusSound): Promise<AudioBuffer> {
    const probe = document.createElement("audio");
    const first = pickSource(sound.sources, (type) => probe.canPlayType(type));
    const order = [first, ...sound.sources.filter((s) => s !== first)];
    let failure: unknown;
    for (const { src } of order) {
      try {
        const response = await fetch(src);
        if (!response.ok) throw new Error(`${src}: ${response.status}`);
        return await context.decodeAudioData(await response.arrayBuffer());
      } catch (error) {
        failure = error;
      }
    }
    throw failure;
  }

  private report(): void {
    this.onPlaying(this.voice !== null && this.context?.state === "running");
  }
}
