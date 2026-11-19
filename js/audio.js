// Beeps (Web Audio) and screen wake lock. iOS needs a user gesture to unlock audio, so
// `unlock()` is called from the first tap on "Start exercise".

let ctx = null;
let enabled = true;

export const setSoundEnabled = (on) => { enabled = on; };

export function unlock() {
  try {
    // Play through the silent switch on iOS 17+ (the user opted into sound in settings).
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    // A silent blip fully unlocks iOS audio.
    tone(1, 0.001, 0);
  } catch { /* audio unavailable */ }
}

function tone(freq, dur, vol = 0.25) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const beep = {
  tick: () => enabled && tone(880, 0.12),
  go: () => enabled && tone(1320, 0.45, 0.35),
  target: () => { if (enabled) { tone(990, 0.12); setTimeout(() => tone(1320, 0.18), 140); } },
  ceiling: () => { if (enabled) { tone(1320, 0.1); setTimeout(() => tone(1320, 0.1), 130); setTimeout(() => tone(1320, 0.1), 260); } },
  cadence: (up) => enabled && tone(up ? 660 : 440, 0.07, 0.12),
  done: () => enabled && tone(520, 0.3),
};

// Very light haptics where supported (Android). iOS Safari ignores this.
export const buzz = (ms = 30) => { try { navigator.vibrate?.(ms); } catch { /* ignore */ } };

// ── Wake lock ───────────────────────────────────────────────────────────────────────────────
let lock = null;
let wantLock = false;

export async function keepAwake(on) {
  wantLock = on;
  try {
    if (on && !lock && 'wakeLock' in navigator) {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } else if (!on && lock) {
      await lock.release();
      lock = null;
    }
  } catch { lock = null; }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wantLock && !lock) keepAwake(true);
});
