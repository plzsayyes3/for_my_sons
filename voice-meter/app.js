(() => {
  const $ = id => document.getElementById(id);
  const button = $('toggle'), status = $('status'), target = $('target');
  let state = 'idle', generation = 0, frame = 0, smoothed = 0, previous = 0, zone = '';
  const labels = {
    idle: ['◡', 'はじめてみよう', 'マイクで こえを みてみよう'],
    small: ['◡', 'ちいさな こえ', 'そっと はなしているね'],
    normal: ['◡', 'ふつうの こえ', 'おはなしの こえだね'],
    large: ['○', 'おおきな こえ', 'すこし こえを ちいさくしてみよう']
  };
  function showZone(next) {
    if (zone === next) return;
    zone = next; document.body.dataset.zone = next;
    [$('face').textContent, $('voice-label').textContent, $('hint').textContent] = labels[next];
    $('meter').setAttribute('aria-valuetext', labels[next][1]);
  }
  function paint(level) {
    $('fill').style.height = `${level}%`;
    $('meter').setAttribute('aria-valuenow', String(Math.round(level)));
  }
  function stop(message = 'とまっています。もういちど はじめられるよ') {
    generation++; state = 'idle'; cancelAnimationFrame(frame); meter?.stop();
    smoothed = 0; paint(0); showZone('idle'); button.textContent = 'はじめる'; status.textContent = message;
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const supported = window.isSecureContext && navigator.mediaDevices?.getUserMedia && AudioContextClass;
  const meter = supported ? VoiceMeter.createMeter({ AudioContext: AudioContextClass, mediaDevices: navigator.mediaDevices },
    () => stop('マイクが とまりました。もういちど はじめてね')) : null;
  function tick(now) {
    if (state !== 'running') return;
    const dt = Math.min(100, now - previous); previous = now;
    const raw = meter.read();
    smoothed += (raw - smoothed) * (1 - Math.exp(-dt / (raw > smoothed ? 100 : 360)));
    paint(smoothed);
    const next = VoiceMeter.zoneFor(smoothed, Number(target.value));
    // A small hysteresis avoids rapid colour changes near a boundary.
    const boundary = next === 'large' || zone === 'large' ? Number(target.value) : Number(target.value) * 0.6;
    if (Math.abs(smoothed - boundary) > 2 || zone === 'idle') showZone(next);
    frame = requestAnimationFrame(tick);
  }
  button.addEventListener('click', async () => {
    if (state !== 'idle') { stop(); return; }
    if (!meter) return;
    const ticket = ++generation; state = 'starting'; button.textContent = 'やめる';
    status.textContent = 'マイクの きょかを まっています…';
    try {
      const started = await meter.start();
      if (ticket !== generation || !started) return;
      if (document.hidden) { stop(); return; }
      state = 'running'; button.textContent = 'とめる'; status.textContent = 'マイクで こえを みています';
      previous = performance.now(); frame = requestAnimationFrame(tick);
    } catch (error) {
      if (ticket !== generation) return;
      const messages = {
        NotAllowedError: 'マイクを使えませんでした。ブラウザのマイク許可を確認して、もういちど はじめてね。',
        NotFoundError: 'マイクが みつかりません。マイクのある端末で ひらいてね。',
        NotReadableError: 'マイクを使えません。ほかのアプリで使っていないか確認してね。'
      };
      stop(messages[error.name] || 'マイクを はじめられませんでした。もういちど はじめてね。');
    }
  });
  target.addEventListener('input', () => {
    $('target-value').value = target.value;
    document.documentElement.style.setProperty('--target', `${target.value}%`);
    document.documentElement.style.setProperty('--quiet', `${Number(target.value) * 0.6}%`);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', () => stop());
  showZone('idle');
  if (!supported) { button.disabled = true; status.textContent = 'マイク対応のSafari・Chromeで、HTTPSのページをひらいてね。'; }
})();
