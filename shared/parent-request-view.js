((root, factory) => {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.ForMySonsParentRequestView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const STYLE_ID = 'fms-parent-request-style';

  function ensureStyles(documentRef) {
    if (documentRef.getElementById(STYLE_ID)) return;
    const style = documentRef.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .fms-request-launch{margin-top:12px;border:0;border-radius:999px;padding:11px 18px;background:#eef6ff;color:#225b96;font:900 15px/1.2 ui-rounded,"SF Pro Rounded","Hiragino Maru Gothic ProN",system-ui,sans-serif;box-shadow:0 4px 0 #c6d8ea;cursor:pointer}
      .fms-request-overlay[hidden],.fms-request-toast[hidden]{display:none!important}
      .fms-request-overlay{position:fixed;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;padding:max(18px,env(safe-area-inset-top)) max(18px,env(safe-area-inset-right)) max(18px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left));background:rgba(21,49,83,.46);backdrop-filter:blur(6px)}
      .fms-request-card{width:min(520px,100%);max-height:min(720px,calc(100dvh - 36px));overflow:auto;border:4px solid #fff;border-radius:28px;padding:22px;background:linear-gradient(180deg,#fffef7,#f5fbff);box-shadow:0 20px 60px rgba(19,55,93,.28);color:#244d79;text-align:left;font-family:ui-rounded,"SF Pro Rounded","Hiragino Maru Gothic ProN",system-ui,sans-serif}
      .fms-request-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}
      .fms-request-head h2{margin:0;font-size:25px;line-height:1.15;color:#215b96}
      .fms-request-close{border:0;width:40px;height:40px;border-radius:50%;background:#eaf2f9;color:#4a6682;font-size:23px;font-weight:900;cursor:pointer}
      .fms-request-label{display:block;margin:14px 0 7px;font-size:14px;font-weight:950;color:#58728d}
      .fms-request-game{padding:12px 14px;border-radius:16px;background:#eef7ff;color:#215b96;font-size:18px;font-weight:950}
      .fms-request-types{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .fms-request-type{min-height:64px;border:3px solid #d8e5f0;border-radius:18px;padding:9px;background:#fff;color:#46627e;font-size:15px;font-weight:950;line-height:1.25;cursor:pointer}
      .fms-request-type[aria-pressed="true"]{border-color:#62b9ff;background:#eaf7ff;color:#165d9d;box-shadow:0 3px 0 #a5d6f5}
      .fms-request-type:disabled{opacity:.72;cursor:default}
      .fms-request-message{width:100%;min-height:132px;resize:vertical;border:3px solid #d8e5f0;border-radius:18px;padding:13px 14px;background:#fff;color:#25445f;font:800 17px/1.55 ui-rounded,"SF Pro Rounded","Hiragino Maru Gothic ProN",system-ui,sans-serif;outline:none}
      .fms-request-message:focus{border-color:#62b9ff;box-shadow:0 0 0 4px rgba(98,185,255,.16)}
      .fms-request-message:disabled{opacity:.78}
      .fms-request-send{width:100%;margin-top:14px;border:0;border-radius:999px;padding:15px 18px;background:linear-gradient(#ffe979,#ffbd3b);color:#244f78;font-size:18px;font-weight:1000;box-shadow:0 6px 0 #d18c16;cursor:pointer}
      .fms-request-send:disabled{opacity:.55;box-shadow:0 3px 0 #c8b77f;cursor:default}
      .fms-request-status{min-height:24px;margin:11px 2px 0;color:#6a7f93;font-size:14px;font-weight:900;text-align:center}
      .fms-request-status.is-error{color:#b64256}
      .fms-request-toast{position:fixed;z-index:130;left:50%;top:50%;transform:translate(-50%,-50%);width:min(360px,calc(100vw - 36px));padding:22px 24px;border:4px solid #fff;border-radius:26px;background:#fffdf0;box-shadow:0 18px 50px rgba(20,54,88,.28);color:#215b96;text-align:center;font:1000 20px/1.5 ui-rounded,"SF Pro Rounded","Hiragino Maru Gothic ProN",system-ui,sans-serif;white-space:pre-line}
      @media(max-width:520px){.fms-request-types{grid-template-columns:1fr}.fms-request-card{padding:18px}.fms-request-head h2{font-size:23px}}
    `;
    documentRef.head.appendChild(style);
  }

  function make(documentRef, tag, className, text) {
    const node = documentRef.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function mount({ container, service, appId, gameName, documentRef = globalThis.document } = {}) {
    if (!container || !service || !documentRef) throw new TypeError('container, service and document are required');
    if (!appId || !gameName) throw new TypeError('appId and gameName are required');
    ensureStyles(documentRef);

    const launch = make(documentRef, 'button', 'fms-request-launch', '💬 パパにお願い');
    launch.type = 'button';

    const overlay = make(documentRef, 'div', 'fms-request-overlay');
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'パパにお願い');

    const card = make(documentRef, 'section', 'fms-request-card');
    const head = make(documentRef, 'div', 'fms-request-head');
    const title = make(documentRef, 'h2', '', '💬 パパにお願い');
    const close = make(documentRef, 'button', 'fms-request-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', '閉じる');
    head.append(title, close);

    const gameLabel = make(documentRef, 'span', 'fms-request-label', 'ゲーム');
    const gameValue = make(documentRef, 'div', 'fms-request-game', gameName);

    const typeLabel = make(documentRef, 'span', 'fms-request-label', 'どっち？');
    const types = make(documentRef, 'div', 'fms-request-types');
    const problem = make(documentRef, 'button', 'fms-request-type', '😵 こまってる');
    const feature = make(documentRef, 'button', 'fms-request-type', '✨ あたらしい機能がほしい');
    problem.type = feature.type = 'button';
    problem.dataset.type = 'problem';
    feature.dataset.type = 'feature';
    problem.setAttribute('aria-pressed', 'false');
    feature.setAttribute('aria-pressed', 'false');
    types.append(problem, feature);

    const messageLabel = make(documentRef, 'label', 'fms-request-label', 'パパにいうこと');
    const textarea = make(documentRef, 'textarea', 'fms-request-message');
    textarea.rows = 5;
    textarea.maxLength = 2000;
    textarea.placeholder = 'じぶんのことばで書いてね';
    messageLabel.htmlFor = 'fms-parent-request-message-' + Math.random().toString(36).slice(2, 9);
    textarea.id = messageLabel.htmlFor;

    const send = make(documentRef, 'button', 'fms-request-send', 'パパにおくる');
    send.type = 'button';
    send.disabled = true;

    const status = make(documentRef, 'div', 'fms-request-status', '');
    status.setAttribute('aria-live', 'polite');

    card.append(head, gameLabel, gameValue, typeLabel, types, messageLabel, textarea, send, status);
    overlay.append(card);

    const toast = make(documentRef, 'div', 'fms-request-toast', 'おくったよ！\nパパがあとでみるね 👋');
    toast.hidden = true;
    toast.setAttribute('role', 'status');

    container.replaceChildren(launch);
    documentRef.body.append(overlay, toast);

    let selectedType = '';
    let currentRequestId = null;
    let sending = false;
    let retryMode = false;
    let previousFocus = null;
    let toastTimer = null;

    function updateSendState() {
      send.disabled = sending || (!retryMode && (!selectedType || !textarea.value.trim()));
    }

    function setType(type) {
      if (retryMode || sending) return;
      selectedType = type;
      problem.setAttribute('aria-pressed', type === 'problem' ? 'true' : 'false');
      feature.setAttribute('aria-pressed', type === 'feature' ? 'true' : 'false');
      updateSendState();
    }

    function lockDraft(locked) {
      problem.disabled = locked;
      feature.disabled = locked;
      textarea.disabled = locked;
    }

    function resetDraft() {
      selectedType = '';
      currentRequestId = null;
      retryMode = false;
      problem.setAttribute('aria-pressed', 'false');
      feature.setAttribute('aria-pressed', 'false');
      textarea.value = '';
      status.textContent = '';
      status.classList.remove('is-error');
      send.textContent = 'パパにおくる';
      lockDraft(false);
      updateSendState();
    }

    function open() {
      previousFocus = documentRef.activeElement;
      overlay.hidden = false;
      requestAnimationFrame(() => retryMode ? send.focus() : problem.focus());
    }

    function closeDialog() {
      overlay.hidden = true;
      previousFocus?.focus?.();
    }

    function showSuccess() {
      closeDialog();
      resetDraft();
      toast.hidden = false;
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast.hidden = true; }, 2800);
    }

    function showFailure() {
      retryMode = true;
      lockDraft(true);
      status.textContent = 'まだ送れていないよ';
      status.classList.add('is-error');
      send.textContent = 'もういちど送る';
      updateSendState();
    }

    problem.addEventListener('click', () => setType('problem'));
    feature.addEventListener('click', () => setType('feature'));
    textarea.addEventListener('input', updateSendState);
    launch.addEventListener('click', open);
    close.addEventListener('click', closeDialog);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeDialog();
    });

    send.addEventListener('click', async () => {
      if (sending) return;
      if (!retryMode && (!selectedType || !textarea.value.trim())) {
        status.textContent = 'どっちか選んで、メッセージを書いてね';
        return;
      }

      sending = true;
      status.classList.remove('is-error');
      status.textContent = retryMode ? 'もういちど送ってるよ…' : '送ってるよ…';
      send.textContent = 'おくってる…';
      updateSendState();

      try {
        if (!currentRequestId) {
          const record = await service.create({
            appId,
            gameName,
            type: selectedType,
            message: textarea.value
          });
          currentRequestId = record.id;
        }

        const result = retryMode
          ? await service.resend(currentRequestId)
          : await service.send(currentRequestId);

        if (result?.syncState === 'synced') {
          showSuccess();
          return;
        }
        showFailure();
      } catch {
        showFailure();
      } finally {
        sending = false;
        updateSendState();
      }
    });

    documentRef.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !overlay.hidden) closeDialog();
    });

    return {
      open,
      close: closeDialog,
      reset: resetDraft,
      destroy() {
        if (toastTimer) clearTimeout(toastTimer);
        overlay.remove();
        toast.remove();
        container.replaceChildren();
      }
    };
  }

  return { mount };
});
