class MicProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true
    const samples = input[0]
    const int16 = new Int16Array(samples.length)
    for (let i = 0; i < samples.length; i++) {
      int16[i] = Math.max(-32768, Math.min(32767, samples[i] * 32767))
    }
    this.port.postMessage(int16.buffer, [int16.buffer])
    return true
  }
}
registerProcessor('mic-processor', MicProcessor)
