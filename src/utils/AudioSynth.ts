/**
 * AudioSynth synthesizes arcade sound effects procedurally via Web Audio API.
 * Requires no external audio files.
 */
export class AudioSynth {
  private static ctx: AudioContext | null = null;
  private static lastRollbackSoundTime: number = 0;

  private static getContext(): AudioContext | null {
    if (!AudioSynth.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        AudioSynth.ctx = new AudioCtx();
      }
    }
    if (AudioSynth.ctx && AudioSynth.ctx.state === 'suspended') {
      AudioSynth.ctx.resume();
    }
    return AudioSynth.ctx;
  }

  /**
   * Sound when shooting an orb.
   */
  public static playShoot(): void {
    const ctx = AudioSynth.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(460, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.11);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.11);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  }

  /**
   * Sound when ball inserts into the chain.
   */
  public static playImpact(): void {
    const ctx = AudioSynth.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.09);
  }

  /**
   * Sound when the front chain surges forward by 1 orb upon insertion.
   */
  public static playSurge(): void {
    const ctx = AudioSynth.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(360, ctx.currentTime + 0.09);

    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  }

  /**
   * Heavy mechanical marble crash when the rollback slams back into the rear chain.
   */
  public static playCrash(): void {
    const ctx = AudioSynth.getContext();
    if (!ctx) return;

    const t = ctx.currentTime;

    // Low punch
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(160, t);
    osc1.frequency.exponentialRampToValueAtTime(45, t + 0.2);
    gain1.gain.setValueAtTime(0.4, t);
    gain1.gain.exponentialRampToValueAtTime(0.01, t + 0.2);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(t);
    osc1.stop(t + 0.21);

    // High clack
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(580, t);
    osc2.frequency.exponentialRampToValueAtTime(120, t + 0.08);
    gain2.gain.setValueAtTime(0.3, t);
    gain2.gain.exponentialRampToValueAtTime(0.01, t + 0.08);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(t);
    osc2.stop(t + 0.09);
  }

  /**
   * Sound of chain rapidly rolling backwards.
   */
  public static playRollbackTick(): void {
    const ctx = AudioSynth.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    if (now - AudioSynth.lastRollbackSoundTime < 0.07) return;
    AudioSynth.lastRollbackSoundTime = now;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260 + Math.random() * 80, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.04);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
  }

  /**
   * Sound when a match of 3+ balls pops.
   */
  public static playMatch(combo: number = 1): void {
    const ctx = AudioSynth.getContext();
    if (!ctx) return;

    const baseFreq = 380 + Math.min(combo * 65, 450);

    [0, 0.04, 0.08].forEach((delay, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq * (1 + idx * 0.28), ctx.currentTime + delay);

      gain.gain.setValueAtTime(0.2, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + delay + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.16);
    });
  }

  /**
   * Sound when swapping loaded & queued orbs.
   */
  public static playSwap(): void {
    const ctx = AudioSynth.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(680, ctx.currentTime + 0.06);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.06);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.07);
  }

  /**
   * Sound for UI button clicks and menu actions.
   */
  public static playUiClick(): void {
    const ctx = AudioSynth.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }
}
