const NOTES = [261.63, 329.63, 392, 523.25, 392, 329.63, 293.66, 440];

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private nextNote = 0;
  private step = 0;
  muted = false;
  musicOn = false;

  unlock() {
    if (typeof window === "undefined") return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.42;
      this.music = this.ctx.createGain();
      this.music.gain.value = 0.22;
      this.music.connect(this.master);
      this.master.connect(this.ctx.destination);
      const n = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.4, this.ctx.sampleRate);
      const data = n.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = n;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  resume() {
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(muted ? 0 : 0.42, this.ctx.currentTime, 0.02);
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  pump() {
    if (!this.ctx || !this.music || !this.musicOn || this.muted) return;
    const t = this.ctx.currentTime;
    if (this.nextNote < t) this.nextNote = t + 0.02;
    while (this.nextNote < t + 0.4) {
      this.blip(NOTES[this.step % NOTES.length], this.nextNote, 0.28, "triangle", 0.045, this.music);
      this.step++;
      this.nextNote += this.step % 4 === 0 ? 0.56 : 0.28;
    }
  }

  jump() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(380, t);
    osc.frequency.exponentialRampToValueAtTime(720, t + 0.09);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  land() {
    this.noiseBurst(0.07, 0.08, 900);
  }

  star() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.blip(880, t, 0.1, "sine", 0.12, this.master);
    this.blip(1320, t + 0.06, 0.14, "sine", 0.1, this.master);
  }

  near() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.blip(660, t, 0.08, "triangle", 0.1, this.master);
    this.blip(990, t + 0.05, 0.12, "triangle", 0.09, this.master);
  }

  crash() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(0.35, 0.28, 500);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.32);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.38);
  }

  close() {
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.music = null;
  }

  private blip(
    freq: number,
    when: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    dest: AudioNode,
  ) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  private noiseBurst(dur: number, gain: number, lp: number) {
    if (!this.ctx || !this.master || !this.noise) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(lp, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}
