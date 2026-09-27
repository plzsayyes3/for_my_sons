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
      .fms-request-overlay[hidden],.fms-request-toast[hidden],.fms-reply-overlay[hidden]{display:none!important}
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
      .fms-request-photo{margin-top:14px;padding:12px;border:3px dashed #d8e5f0;border-radius:18px;background:#fff}
      .fms-request-photo-label{display:block;font-size:14px;font-weight:950;color:#58728d}
      .fms-request-photo-input{display:block;width:100%;margin-top:8px;font-size:16px;color:#46627e}
      .fms-request-photo-preview[hidden]{display:none!important}
      .fms-request-photo-preview{display:grid;grid-template-columns:88px 1fr;gap:12px;align-items:center;margin-top:12px}
      .fms-request-photo-preview img{width:88px;height:88px;object-fit:cover;border-radius:14px;border:2px solid #d8e5f0}
      .fms-request-photo-remove{border:0;border-radius:999px;padding:10px 12px;background:#eef2f5;color:#536b81;font-weight:900;cursor:pointer}
      .fms-request-photo-note{display:block;margin-top:7px;font-size:12px;font-weight:800;color:#73879a}
      .fms-request-send{width:100%;margin-top:14px;border:0;border-radius:999px;padding:15px 18px;background:linear-gradient(#ffe979,#ffbd3b);color:#244f78;font-size:18px;font-weight:1000;box-shadow:0 6px 0 #d18c16;cursor:pointer}
      .fms-request-send:disabled{opacity:.55;box-shadow:0 3px 0 #c8b77f;cursor:default}
      .fms-request-status{min-height:24px;margin:11px 2px 0;color:#6a7f93;font-size:14px;font-weight:900;text-align:center}
      .fms-request-status.is-error{color:#b64256}
      .fms-request-toast{position:fixed;z-index:130;left:50%;top:50%;transform:translate(-50%,-50%);width:min(360px,calc(100vw - 36px));padding:22px 24px;border:4px solid #fff;border-radius:26px;background:#fffdf0;box-shadow:0 18px 50px rgba(20,54,88,.28);color:#215b96;text-align:center;font:1000 20px/1.5 ui-rounded,"SF Pro Rounded","Hiragino Maru Gothic ProN",system-ui,sans-serif;white-space:pre-line}
      .fms-reply-overlay{position:fixed;inset:0;z-index:140;display:flex;align-items:center;justify-content:center;padding:max(18px,env(safe-area-inset-top)) max(18px,env(safe-area-inset-right)) max(18px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left));background:rgba(20,49,82,.52);backdrop-filter:blur(7px)}
      .fms-reply-card{width:min(460px,100%);border:4px solid #fff;border-radius:28px;padding:22px;background:linear-gradient(180deg,#fffdf0,#f2fbff);box-shadow:0 20px 60px rgba(18,52,88,.3);color:#244d79;text-align:center;font-family:ui-rounded,"SF Pro Rounded","Hiragino Maru Gothic ProN",system-ui,sans-serif}
      .fms-reply-card h2{margin:0 0 14px;font-size:25px;color:#215b96}
      .fms-reply-original{margin:8px 0 14px;padding:11px 13px;border-radius:16px;background:#eef6ff;color:#5c7691;font-size:14px;font-weight:900;text-align:left;line-height:1.45}
      .fms-reply-message{margin:8px 0 16px;padding:16px;border-radius:18px;background:#fff6c9;color:#244f78;font-size:19px;font-weight:1000;text-align:left;line-height:1.55;white-space:pre-wrap}
      .fms-reply-read{width:100%;border:0;border-radius:999px;padding:15px 18px;background:linear-gradient(#8ff0b0,#49c77a);color:#174d34;font-size:19px;font-weight:1000;box-shadow:0 6px 0 #2d9b58;cursor:pointer}
      .fms-reply-read:disabled{opacity:.6;box-shadow:0 3px 0 #7ba98b}
      .fms-reply-later{margin-top:12px;border:0;background:transparent;color:#72869a;font-size:13px;font-weight:900;text-decoration:underline;cursor:pointer}
      .fms-reply-status{min-height:22px;margin-top:10px;color:#b64256;font-size:13px;font-weight:900}
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

  async function canvasBlob(canvas, type, quality) {
    if (typeof canvas?.toBlob !== 'function') return null;
    return new Promise(resolve => canvas.toBlob(resolve, type, quality));
  }

  async function prepareImage(file, documentRef) {
    if (!file || !String(file.type || '').startsWith('image/')) throw new TypeError('画像ファイルを選んでね');
    if (Number(file.size || 0) > 25 * 1024 * 1024) throw new TypeError('写真が大きすぎるよ');

    const url = URL.createObjectURL(file);
    try {
      const image = documentRef.createElement('img');
      image.decoding = 'async';
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = url;
      });
      const maxDimension = 1600;
      const naturalWidth = Math.max(1, Number(image.naturalWidth || image.width || 1));
      const naturalHeight = Math.max(1, Number(image.naturalHeight || image.height || 1));
      const scale = Math.min(1, maxDimension / Math.max(naturalWidth, naturalHeight));
      const canvas = documentRef.createElement('canvas');
      canvas.width = Math.max(1, Math.round(naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('画像を準備できませんでした');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      let blob = await canvasBlob(canvas, 'image/webp', 0.82);
      if (!blob || blob.size > 5 * 1024 * 1024) blob = await canvasBlob(canvas, 'image/jpeg', 0.78);
      if (!blob || blob.size > 5 * 1024 * 1024) throw new TypeError('写真が大きすぎるよ');
      return blob;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function mount({
    container,
    service,
    appId,
    gameName,
    documentRef = globalThis.document,
    launchLabel = '💬 パパにお願い',
    pendingLaunchLabel = '💬 まだ送れていないお願い',
    titleText = '💬 パパにお願い',
    fixedType = '',
    hideGame = false,
    messageLabelText = 'パパにいうこと',
    placeholder = 'じぶんのことばで書いてね',
    sendLabel = 'パパにおくる',
    successText = 'おくったよ！\\nパパがあとでみるね 👋',
    allowImage = false
  } = {}) {
    if (!container || !service || !documentRef) throw new TypeError('container, service and document are required');
    if (!appId || !gameName) throw new TypeError('appId and gameName are required');
    if (fixedType && !['problem', 'feature'].includes(fixedType)) throw new TypeError('fixedType is invalid');
    ensureStyles(documentRef);

    const launch = make(documentRef, 'button', 'fms-request-launch', launchLabel);
    launch.type = 'button';

    const overlay = make(documentRef, 'div', 'fms-request-overlay');
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'パパにお願い');

    const card = make(documentRef, 'section', 'fms-request-card');
    const head = make(documentRef, 'div', 'fms-request-head');
    const title = make(documentRef, 'h2', '', titleText);
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

    const messageLabel = make(documentRef, 'label', 'fms-request-label', messageLabelText);
    const textarea = make(documentRef, 'textarea', 'fms-request-message');
    textarea.rows = 5;
    textarea.maxLength = 2000;
    textarea.placeholder = placeholder;
    messageLabel.htmlFor = 'fms-parent-request-message-' + Math.random().toString(36).slice(2, 9);
    textarea.id = messageLabel.htmlFor;

    const photo = make(documentRef, 'div', 'fms-request-photo');
    photo.hidden = !allowImage;
    const photoLabel = make(documentRef, 'label', 'fms-request-photo-label', '📷 写真や絵（なくてもOK）');
    const photoInput = make(documentRef, 'input', 'fms-request-photo-input');
    photoInput.type = 'file';
    photoInput.accept = 'image/*';
    photoLabel.append(photoInput);
    const photoNote = make(documentRef, 'span', 'fms-request-photo-note', '写真・スクショ・描いた絵を1枚つけられるよ');
    const photoPreview = make(documentRef, 'div', 'fms-request-photo-preview');
    photoPreview.hidden = true;
    const photoImage = make(documentRef, 'img', '');
    photoImage.alt = '送る画像のプレビュー';
    const photoRemove = make(documentRef, 'button', 'fms-request-photo-remove', '写真をはずす');
    photoRemove.type = 'button';
    photoPreview.append(photoImage, photoRemove);
    photo.append(photoLabel, photoNote, photoPreview);

    const send = make(documentRef, 'button', 'fms-request-send', sendLabel);
    send.type = 'button';
    send.disabled = true;

    const status = make(documentRef, 'div', 'fms-request-status', '');
    status.setAttribute('aria-live', 'polite');

    gameLabel.hidden = gameValue.hidden = hideGame;
    typeLabel.hidden = types.hidden = Boolean(fixedType);
    card.append(head, gameLabel, gameValue, typeLabel, types, messageLabel, textarea, photo, send, status);
    overlay.append(card);

    const toast = make(documentRef, 'div', 'fms-request-toast', successText);
    toast.hidden = true;
    toast.setAttribute('role', 'status');

    const replyOverlay = make(documentRef, 'div', 'fms-reply-overlay');
    replyOverlay.hidden = true;
    replyOverlay.setAttribute('role', 'dialog');
    replyOverlay.setAttribute('aria-modal', 'true');
    replyOverlay.setAttribute('aria-label', 'パパからのへんじ');
    const replyCard = make(documentRef, 'section', 'fms-reply-card');
    const replyTitle = make(documentRef, 'h2', '', '📩 パパからへんじがきたよ！');
    const replyOriginal = make(documentRef, 'div', 'fms-reply-original', '');
    const replyMessage = make(documentRef, 'div', 'fms-reply-message', '');
    const replyRead = make(documentRef, 'button', 'fms-reply-read', '読んだよ');
    replyRead.type = 'button';
    const replyLater = make(documentRef, 'button', 'fms-reply-later', 'あとで見る');
    replyLater.type = 'button';
    const replyStatus = make(documentRef, 'div', 'fms-reply-status', '');
    replyStatus.setAttribute('aria-live', 'polite');
    replyCard.append(replyTitle, replyOriginal, replyMessage, replyRead, replyLater, replyStatus);
    replyOverlay.append(replyCard);

    container.replaceChildren(launch);
    documentRef.body.append(overlay, toast, replyOverlay);

    let selectedType = fixedType || '';
    let currentRequestId = null;
    let selectedImageBlob = null;
    let selectedImageUrl = null;
    let sending = false;
    let retryMode = false;
    let previousFocus = null;
    let toastTimer = null;
    let replyQueue = [];
    let currentReply = null;
    let markingRead = false;

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
      photoInput.disabled = locked;
      photoRemove.disabled = locked;
    }

    function clearImage() {
      selectedImageBlob = null;
      photoInput.value = '';
      if (selectedImageUrl) URL.revokeObjectURL(selectedImageUrl);
      selectedImageUrl = null;
      photoImage.removeAttribute('src');
      photoPreview.hidden = true;
    }

    function showImage(blob) {
      clearImage();
      if (!blob) return;
      selectedImageBlob = blob;
      selectedImageUrl = URL.createObjectURL(blob);
      photoImage.src = selectedImageUrl;
      photoPreview.hidden = false;
    }

    function resetDraft() {
      selectedType = fixedType || '';
      currentRequestId = null;
      retryMode = false;
      launch.textContent = launchLabel;
      problem.setAttribute('aria-pressed', selectedType === 'problem' ? 'true' : 'false');
      feature.setAttribute('aria-pressed', selectedType === 'feature' ? 'true' : 'false');
      textarea.value = '';
      clearImage();
      status.textContent = '';
      status.classList.remove('is-error');
      send.textContent = sendLabel;
      lockDraft(false);
      updateSendState();
    }

    function open() {
      previousFocus = documentRef.activeElement;
      overlay.hidden = false;
      requestAnimationFrame(() => retryMode ? send.focus() : (fixedType ? textarea.focus() : problem.focus()));
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
      launch.textContent = pendingLaunchLabel;
      lockDraft(true);
      status.textContent = 'まだ送れていないよ';
      status.classList.add('is-error');
      send.textContent = 'もういちど送る';
      updateSendState();
    }

    async function restorePending() {
      if (typeof service.listUnsent !== 'function') return;
      try {
        const unsent = await service.listUnsent({ appId, currentProfileOnly: true });
        const pending = unsent
          .filter(record => record?.appId === appId)
          .sort((a, b) => Date.parse(a?.createdAt || 0) - Date.parse(b?.createdAt || 0))[0];
        if (!pending) return;

        selectedType = pending.type === 'problem' || pending.type === 'feature' ? pending.type : '';
        currentRequestId = pending.id;
        retryMode = true;
        problem.setAttribute('aria-pressed', selectedType === 'problem' ? 'true' : 'false');
        feature.setAttribute('aria-pressed', selectedType === 'feature' ? 'true' : 'false');
        textarea.value = pending.message || '';
        if (pending.imageBlob) showImage(pending.imageBlob);
        launch.textContent = pendingLaunchLabel;
        lockDraft(true);
        status.textContent = 'まだ送れていないお願いがあるよ';
        status.classList.add('is-error');
        send.textContent = 'もういちど送る';
        updateSendState();
      } catch {}
    }

    function showNextReply() {
      if (currentReply || !replyQueue.length) return;
      currentReply = replyQueue.shift();
      replyOriginal.textContent = 'あなたのおねがい：' + (currentReply.message || '');
      replyMessage.textContent = currentReply.reply?.message || '';
      replyStatus.textContent = '';
      replyRead.disabled = false;
      replyRead.textContent = '読んだよ';
      replyOverlay.hidden = false;
      requestAnimationFrame(() => replyRead.focus());
    }

    async function checkReplies() {
      if (typeof service.refreshReplies !== 'function') return;
      try {
        const replies = await service.refreshReplies({ appId, currentProfileOnly: true });
        replyQueue = replies
          .filter(record => record?.reply?.message && !record?.reply?.readAt)
          .sort((a, b) => Date.parse(a.reply?.repliedAt || 0) - Date.parse(b.reply?.repliedAt || 0));
        showNextReply();
      } catch {}
    }

    async function markCurrentReplyRead() {
      if (markingRead || !currentReply || typeof service.markReplyRead !== 'function') return;
      markingRead = true;
      replyRead.disabled = true;
      replyRead.textContent = 'つたえてるよ…';
      replyStatus.textContent = '';
      try {
        const result = await service.markReplyRead(currentReply.id);
        if (!result?.ok) throw new Error('read receipt failed');
        replyOverlay.hidden = true;
        currentReply = null;
        markingRead = false;
        showNextReply();
      } catch {
        markingRead = false;
        replyRead.disabled = false;
        replyRead.textContent = '読んだよ';
        replyStatus.textContent = 'まだ「読んだよ」を送れていないよ。もういちど押してね';
      }
    }

    photoInput.addEventListener('change', async () => {
      const file = photoInput.files?.[0] || null;
      if (!file) return clearImage();
      status.classList.remove('is-error');
      status.textContent = '写真を準備してるよ…';
      try {
        const blob = await prepareImage(file, documentRef);
        showImage(blob);
        status.textContent = '';
      } catch (error) {
        clearImage();
        status.textContent = error?.message || '写真を準備できなかったよ';
        status.classList.add('is-error');
      }
    });
    photoRemove.addEventListener('click', () => {
      if (sending || retryMode) return;
      clearImage();
    });

    problem.addEventListener('click', () => setType('problem'));
    feature.addEventListener('click', () => setType('feature'));
    textarea.addEventListener('input', updateSendState);
    launch.addEventListener('click', open);
    close.addEventListener('click', closeDialog);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeDialog();
    });
    replyRead.addEventListener('click', markCurrentReplyRead);
    replyLater.addEventListener('click', () => {
      replyOverlay.hidden = true;
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
            message: textarea.value,
            image: selectedImageBlob,
            imageContentType: selectedImageBlob?.type || ''
          });
          currentRequestId = record.id;
        }

        const result = retryMode
          ? await service.resend(currentRequestId)
          : await service.send(currentRequestId);

        if (result?.syncState === 'synced') {
          showSuccess();
          void restorePending();
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

    async function refresh() {
      resetDraft();
      replyQueue = [];
      currentReply = null;
      replyOverlay.hidden = true;
      await restorePending();
      await checkReplies();
    }

    void restorePending();
    void checkReplies();

    return {
      open,
      close: closeDialog,
      reset: resetDraft,
      checkReplies,
      refresh,
      destroy() {
        if (toastTimer) clearTimeout(toastTimer);
        if (selectedImageUrl) URL.revokeObjectURL(selectedImageUrl);
        overlay.remove();
        toast.remove();
        replyOverlay.remove();
        container.replaceChildren();
      }
    };
  }

  return { mount };
});
