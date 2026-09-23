(() => {
  const SESSION_KEY = "for-my-sons-wanko-cloud-session-v1";

  function config() {
    const c = window.WANKO_CLOUD_CONFIG || {};
    return {
      url: String(c.url || "").replace(/\/$/, ""),
      key: c.publishableKey || c.anonKey || "",
      bucket: c.bucket || "wanko-images",
      table: c.table || "wankos",
      profileTable: c.profileTable || "wanko_profiles"
    };
  }

  function configured() {
    const c = config();
    return Boolean(c.url && c.key);
  }

  function readSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
    catch { return null; }
  }

  function writeSession(session) {
    if (!session) {
      localStorage.removeItem(SESSION_KEY);
      window.dispatchEvent(new CustomEvent("wanko-cloud-auth-changed"));
      return null;
    }
    const normalized = session.session || session;
    if (!normalized?.access_token) return null;
    const expiresIn = Number(normalized.expires_in || 3600);
    const value = {
      access_token: normalized.access_token,
      refresh_token: normalized.refresh_token,
      token_type: normalized.token_type || "bearer",
      user: normalized.user || session.user || null,
      expires_at_ms: normalized.expires_at
        ? Number(normalized.expires_at) * 1000
        : Date.now() + expiresIn * 1000
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("wanko-cloud-auth-changed", { detail: { user: value.user } }));
    return value;
  }

  async function authRequest(path, options = {}) {
    const c = config();
    if (!configured()) throw new Error("Supabase is not configured");
    const response = await fetch(c.url + "/auth/v1" + path, {
      ...options,
      headers: {
        apikey: c.key,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.msg || body.message || body.error_description || ("Auth " + response.status));
    return body;
  }

  async function refreshSession() {
    const current = readSession();
    if (!current?.refresh_token) return null;
    try {
      const body = await authRequest("/token?grant_type=refresh_token", {
        method: "POST",
        body: JSON.stringify({ refresh_token: current.refresh_token })
      });
      return writeSession(body);
    } catch (error) {
      console.warn("Wanko cloud refresh failed", error);
      writeSession(null);
      return null;
    }
  }

  async function getSession() {
    let current = readSession();
    if (!current) return null;
    if (current.expires_at_ms - Date.now() < 60000) current = await refreshSession();
    return current;
  }

  async function signUp(email, password) {
    const body = await authRequest("/signup", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    const session = writeSession(body);
    return { body, session, needsEmailConfirmation: !session };
  }

  async function signIn(email, password) {
    const body = await authRequest("/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    const session = writeSession(body);
    if (!session) throw new Error("ログインセッションを取得できませんでした");
    return session;
  }

  async function signOut() {
    const session = await getSession();
    if (session) {
      const c = config();
      await fetch(c.url + "/auth/v1/logout", {
        method: "POST",
        headers: { apikey: c.key, Authorization: "Bearer " + session.access_token }
      }).catch(() => {});
    }
    writeSession(null);
  }

  async function authFetch(url, options = {}, retry = true) {
    const c = config();
    const session = await getSession();
    if (!session) throw new Error("CLOUD_SIGN_IN_REQUIRED");
    const headers = {
      apikey: c.key,
      Authorization: "Bearer " + session.access_token,
      ...(options.headers || {})
    };
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401 && retry) {
      const refreshed = await refreshSession();
      if (refreshed) return authFetch(url, options, false);
    }
    return response;
  }

  function pathEncode(path) {
    return String(path).split("/").map(encodeURIComponent).join("/");
  }

  async function currentUser() {
    const session = await getSession();
    return session?.user || null;
  }

  async function uploadImage(record) {
    const c = config();
    const user = await currentUser();
    if (!user) throw new Error("CLOUD_SIGN_IN_REQUIRED");
    const path = user.id + "/" + record.id + ".png";
    const response = await authFetch(
      c.url + "/storage/v1/object/" + encodeURIComponent(c.bucket) + "/" + pathEncode(path),
      {
        method: "POST",
        headers: {
          "Content-Type": record.blob?.type || "image/png",
          "x-upsert": "true"
        },
        body: record.blob
      }
    );
    if (!response.ok) throw new Error("画像同期に失敗しました (" + response.status + ")");
    return path;
  }

  async function upsertMetadata(record, imagePath) {
    const c = config();
    const user = await currentUser();
    if (!user) throw new Error("CLOUD_SIGN_IN_REQUIRED");
    const row = {
      id: record.id,
      user_id: user.id,
      name: record.name,
      creator: record.creator || "paint",
      created_at: record.createdAt,
      updated_at: record.updatedAt || new Date().toISOString(),
      image_path: imagePath,
      stats: record.stats || {},
      archived: Boolean(record.archived)
    };
    const response = await authFetch(
      c.url + "/rest/v1/" + encodeURIComponent(c.table) + "?on_conflict=id",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify(row)
      }
    );
    if (!response.ok) throw new Error("データ同期に失敗しました (" + response.status + ")");
    return row;
  }

  async function pushWanko(record) {
    const imagePath = await uploadImage(record);
    await upsertMetadata(record, imagePath);
    return imagePath;
  }

  async function listRemoteWankos() {
    const c = config();
    const response = await authFetch(
      c.url + "/rest/v1/" + encodeURIComponent(c.table) +
      "?select=id,name,creator,created_at,updated_at,image_path,stats,archived&archived=eq.false&order=created_at.asc"
    );
    if (!response.ok) throw new Error("クラウド一覧の取得に失敗しました (" + response.status + ")");
    return response.json();
  }

  async function downloadImage(imagePath) {
    const c = config();
    const response = await authFetch(
      c.url + "/storage/v1/object/authenticated/" + encodeURIComponent(c.bucket) + "/" + pathEncode(imagePath)
    );
    if (!response.ok) throw new Error("画像復元に失敗しました (" + response.status + ")");
    return response.blob();
  }

  async function getProfile() {
    const c = config();
    const user = await currentUser();
    if (!user) throw new Error("CLOUD_SIGN_IN_REQUIRED");
    const response = await authFetch(
      c.url + "/rest/v1/" + encodeURIComponent(c.profileTable) +
      "?select=active_wanko_id&user_id=eq." + encodeURIComponent(user.id) + "&limit=1"
    );
    if (!response.ok) throw new Error("設定取得に失敗しました (" + response.status + ")");
    const rows = await response.json();
    return rows[0] || null;
  }

  async function setActiveWanko(id) {
    const c = config();
    const user = await currentUser();
    if (!user) throw new Error("CLOUD_SIGN_IN_REQUIRED");
    const row = { user_id: user.id, active_wanko_id: id || null, updated_at: new Date().toISOString() };
    const response = await authFetch(
      c.url + "/rest/v1/" + encodeURIComponent(c.profileTable) + "?on_conflict=user_id",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify(row)
      }
    );
    if (!response.ok) throw new Error("使用中わんこの同期に失敗しました (" + response.status + ")");
  }

  window.WankoCloud = {
    configured,
    getSession,
    currentUser,
    signUp,
    signIn,
    signOut,
    pushWanko,
    listRemoteWankos,
    downloadImage,
    getProfile,
    setActiveWanko,
    config
  };
})();