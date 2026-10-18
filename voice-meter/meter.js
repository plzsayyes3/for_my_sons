(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VoiceMeter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function levelFromSamples(samples) {
    let energy = 0;
    for (const value of samples) energy += value * value;
    const rms = Math.sqrt(energy / (samples.length || 1));
    return Math.max(0, Math.min(100, (20 * Math.log10(Math.max(rms, 0.000001)) + 60) / 60 * 100));
  }
  function zoneFor(level, target) {
    return level > target ? 'large' : level > target * 0.6 ? 'normal' : 'small';
  }
  function createMeter(env, onEnded = () => {}) {
    let session = null;
    function release(s) {
      if (!s || s.released) return;
      s.released = true;
      if (s.stream) s.stream.getTracks().forEach(track => track.stop());
      if (s.source) s.source.disconnect();
      if (s.analyser) s.analyser.disconnect();
      if (s.context && s.context.state !== 'closed') s.context.close().catch(() => {});
    }
    function stop() { const old = session; session = null; release(old); }
    async function start() {
      stop();
      const s = {}; session = s;
      try {
        // Create and resume in the user's tap, before awaiting microphone permission (iOS).
        s.context = new env.AudioContext();
        const resumed = s.context.resume();
        const permission = env.mediaDevices.getUserMedia({ audio: {
          echoCancellation: false, noiseSuppression: false, autoGainControl: false
        }, video: false });
        // Attach both rejection handlers immediately, including when resume fails first.
        const results = await Promise.allSettled([resumed, permission]);
        if (results[1].status === 'fulfilled') s.stream = results[1].value;
        if (session !== s) {
          if (s.stream) s.stream.getTracks().forEach(track => track.stop());
          release(s); return false;
        }
        const rejected = results.find(r => r.status === 'rejected');
        if (rejected) throw rejected.reason;
        if (s.context.state !== 'running') throw Object.assign(new Error('Audio paused'), { name: 'AudioPausedError' });
        s.analyser = s.context.createAnalyser(); s.analyser.fftSize = 2048;
        s.samples = new Float32Array(s.analyser.fftSize);
        s.source = s.context.createMediaStreamSource(s.stream);
        s.source.connect(s.analyser); // No connection to speakers and no recording.
        s.stream.getTracks().forEach(track => track.addEventListener('ended', () => {
          if (session === s) { stop(); onEnded(); }
        }));
        s.context.onstatechange = () => {
          if (session === s && s.context.state !== 'running') { stop(); onEnded(); }
        };
        return true;
      } catch (error) {
        if (session !== s) { release(s); return false; }
        stop(); throw error;
      }
    }
    function read() {
      if (!session?.analyser) return 0;
      session.analyser.getFloatTimeDomainData(session.samples);
      return levelFromSamples(session.samples);
    }
    return { start, stop, read };
  }
  return { levelFromSamples, zoneFor, createMeter };
});
