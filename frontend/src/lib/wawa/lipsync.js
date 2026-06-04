// Based on Oculus LipSync viseme set
// https://developers.meta.com/horizon/documentation/unity/audio-ovrlipsync-viseme-reference/

const FSMStates = {
  silence: "silence",
  vowel: "vowel",
  plosive: "plosive",
  fricative: "fricative",
};

const VISEMES = {
  sil: "viseme_sil",
  PP: "viseme_PP",
  FF: "viseme_FF",
  TH: "viseme_TH",
  DD: "viseme_DD",
  kk: "viseme_kk",
  CH: "viseme_CH",
  SS: "viseme_SS",
  nn: "viseme_nn",
  RR: "viseme_RR",
  aa: "viseme_aa",
  E: "viseme_E",
  I: "viseme_I",
  O: "viseme_O",
  U: "viseme_U",
};

const VISEMES_STATES = {
  [VISEMES.sil]: FSMStates.silence,
  [VISEMES.PP]: FSMStates.plosive,
  [VISEMES.FF]: FSMStates.fricative,
  [VISEMES.TH]: FSMStates.fricative,
  [VISEMES.DD]: FSMStates.plosive,
  [VISEMES.kk]: FSMStates.plosive,
  [VISEMES.CH]: FSMStates.fricative,
  [VISEMES.SS]: FSMStates.fricative,
  [VISEMES.nn]: FSMStates.plosive,
  [VISEMES.RR]: FSMStates.fricative,
  [VISEMES.aa]: FSMStates.vowel,
  [VISEMES.E]: FSMStates.vowel,
  [VISEMES.I]: FSMStates.vowel,
  [VISEMES.O]: FSMStates.vowel,
  [VISEMES.U]: FSMStates.vowel,
};

const average = (arr) => {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
};

export class Lipsync {
  constructor(params = { fftSize: 2048, historySize: 10 }) {
    const { fftSize = 2048, historySize = 10 } = params;
    this.features = null;
    this.viseme = VISEMES.sil;
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = fftSize;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.history = [];
    this.historySize = historySize;
    this.sampleRate = this.audioContext.sampleRate;
    this.binWidth = this.sampleRate / fftSize;
    this.state = FSMStates.silence;
    this.visemeStartTime = 0;
    this.maxVisemeDuration = 100;

    this.bands = [
      { start: 50, end: 200 },
      { start: 200, end: 400 },
      { start: 400, end: 800 },
      { start: 800, end: 1500 },
      { start: 1500, end: 2500 },
      { start: 2500, end: 4000 },
      { start: 4000, end: 8000 },
    ];
  }

  connectAudio(audio) {
    this.audioContext.resume();
    this.history = [];
    this.features = null;
    this.state = FSMStates.silence;
    this.visemeStartTime = performance.now();

    if (this.audioSource === audio) return;
    this.audioSource = audio;
    if (!audio.src) {
      console.warn("An audio source must be set before connecting");
      return;
    }
    const source = this.audioContext.createMediaElementSource(audio);
    source.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);
  }

  async connectMicrophone() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
      return source;
    } catch (err) {
      console.error("Error accessing microphone:", err);
      throw err;
    }
  }

  extractFeatures() {
    this.analyser.getByteFrequencyData(this.dataArray);
    const bandEnergies = this.bands.map(({ start, end }) => {
      const startBin = Math.round(start / this.binWidth);
      const endBin = Math.min(Math.round(end / this.binWidth), this.dataArray.length - 1);
      return average(Array.from(this.dataArray.slice(startBin, endBin))) / 255;
    });

    let sumAmplitude = 0;
    let weightedSum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const freq = i * this.binWidth;
      const amp = this.dataArray[i] / 255;
      sumAmplitude += amp;
      weightedSum += freq * amp;
    }
    const centroid = sumAmplitude > 0 ? weightedSum / sumAmplitude : 0;
    const volume = average(bandEnergies);
    const deltaBands = bandEnergies.map((energy, index) => {
      if (this.history.length < 2) return 0;
      return energy - this.history[this.history.length - 2].bands[index];
    });

    const features = { bands: bandEnergies, deltaBands, volume, centroid };
    if (sumAmplitude > 0) {
      this.history.push(features);
      if (this.history.length > this.historySize) this.history.shift();
    }
    return features;
  }

  getAveragedFeatures() {
    const len = this.history.length;
    const sum = { volume: 0, centroid: 0, bands: Array(this.bands.length).fill(0) };
    for (const f of this.history) {
      sum.volume += f.volume;
      sum.centroid += f.centroid;
      f.bands.forEach((b, i) => (sum.bands[i] += b));
    }
    const bands = sum.bands.map((b) => b / len);
    return { volume: sum.volume / len, centroid: sum.centroid / len, bands, deltaBands: bands };
  }

  detectState() {
    const current = this.history[this.history.length - 1];
    if (!current) {
      this.state = FSMStates.silence;
      this.viseme = VISEMES.sil;
      return;
    }
    const avg = this.getAveragedFeatures();
    const dVolume = current.volume - avg.volume;
    const dCentroid = current.centroid - avg.centroid;
    const visemeScores = this.computeVisemeScores(current, avg, dVolume, dCentroid);
    const adjustedScores = this.adjustScoresForConsistency(visemeScores);
    let maxScore = -Infinity;
    let topViseme = VISEMES.sil;
    for (const v in adjustedScores) {
      if (adjustedScores[v] > maxScore) {
        maxScore = adjustedScores[v];
        topViseme = v;
      }
    }
    if (topViseme !== this.viseme) this.visemeStartTime = performance.now();
    this.state = VISEMES_STATES[topViseme];
    this.viseme = topViseme;
    this.scores = adjustedScores; // Store full scores for blending
  }

  computeVisemeScores(current, avg, dVolume, dCentroid) {
    const scores = {};
    Object.values(VISEMES).forEach(v => scores[v] = 0);
    const b7 = current.bands[6];

    if (avg.volume < 0.12 && current.volume < 0.12) scores[VISEMES.sil] = 1.0;

    Object.entries(VISEMES_STATES).forEach(([viseme, state]) => {
      if (state === FSMStates.plosive) {
        if (dVolume < 0.01) scores[viseme] -= 0.5;
        if (avg.volume < 0.2) scores[viseme] += 0.2;
        if (dCentroid > 1000) scores[viseme] += 0.2;
      }
    });

    if (current.centroid > 1000 && current.centroid < 8000) {
      if (current.centroid > 7000) scores[VISEMES.DD] += 0.8;
      else if (current.centroid > 5000) scores[VISEMES.kk] += 0.8;
      else if (current.centroid > 4000) {
        scores[VISEMES.PP] += 1.2;
        if (b7 > 0.25 && current.centroid < 6000) scores[VISEMES.DD] += 1.6;
      } else scores[VISEMES.nn] += 0.8;
    }

    if (dCentroid > 800 && current.centroid > 5500 && avg.centroid > 4500) {
      if (current.bands[6] > 0.35 && avg.bands[6] > 0.25) scores[VISEMES.FF] = 0.9;
    }

    if (avg.volume > 0.08 && avg.centroid < 6500 && current.centroid < 6500) {
      const [b1, b2, b3, b4, b5] = avg.bands;
      const gapB1B2 = Math.abs(b1 - b2);
      const maxGapB2B3B4 = Math.max(Math.abs(b2 - b3), Math.abs(b2 - b4), Math.abs(b3 - b4));
      if (b3 > 0.08 || b4 > 0.08) {
        if (b4 > b3) { scores[VISEMES.aa] = 1.0; if (b3 > b2) scores[VISEMES.aa] += 0.3; }
        if (b3 > b2 && b3 > b4) scores[VISEMES.I] = 0.9;
        if (gapB1B2 < 0.3) scores[VISEMES.U] = 0.9;
        if (maxGapB2B3B4 < 0.3) scores[VISEMES.O] = 1.1;
        if (b2 > b3 && b3 > b4) scores[VISEMES.E] = 1.2;
        if (b3 < 0.2 && b4 > 0.3) scores[VISEMES.I] = 0.9;
        if (b3 > 0.25 && b5 > 0.25) scores[VISEMES.O] = 0.9;
        if (b3 < 0.15 && b5 < 0.15) scores[VISEMES.U] = 0.9;
      }
    }
    return scores;
  }

  adjustScoresForConsistency(scores) {
    const adjustedScores = { ...scores };
    if (this.viseme && this.state) {
      const visemeDuration = performance.now() - this.visemeStartTime;
      for (const v in adjustedScores) {
        if (v === this.viseme) {
          let boostFactor;
          const earlyPhaseEnd = 100;
          if (visemeDuration <= earlyPhaseEnd) boostFactor = 1.3;
          else if (visemeDuration <= this.maxVisemeDuration) {
            const decay = (visemeDuration - earlyPhaseEnd) / (this.maxVisemeDuration - earlyPhaseEnd);
            boostFactor = 1.3 - 0.3 * decay;
          } else boostFactor = Math.max(0.5, 1.0 - (visemeDuration - this.maxVisemeDuration) / 1000);
          adjustedScores[v] *= boostFactor;
        }
      }
    }
    return adjustedScores;
  }

  processAudio() {
    this.features = this.extractFeatures();
    this.detectState();
  }
}

export default Lipsync;
