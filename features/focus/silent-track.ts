/**
 * Ten seconds of silence (8 kHz, 8-bit mono WAV), made here instead of shipped as a file. Lock-screen
 * controls only show for a media element that is playing; the sound itself comes from Web Audio,
 * which loops without a gap. Longer than 5 s because Chrome ignores shorter ones.
 */
const RATE = 8000;
const SECONDS = 10;

export function silentWav(): Blob {
  const samples = RATE * SECONDS;
  const bytes = new Uint8Array(44 + samples).fill(128, 44); // 128 is zero in 8-bit PCM.
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, "data");
  view.setUint32(40, samples, true);
  return new Blob([bytes], { type: "audio/wav" });
}
