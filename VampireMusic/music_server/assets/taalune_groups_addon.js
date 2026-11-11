(() => {
  "use strict";

  if (window.__taaluneGroupPlayerLoaded) return;
  window.__taaluneGroupPlayerLoaded = true;

  const telegram = window.Telegram?.WebApp;
  const initData = telegram?.initData || "";
  const $ = id => document.getElementById(id);
  const selectedStorageKey = "taalune.selectedGroup";

  const state = {
    groups: new Map(),
    signatures: new Map(),
    selectedGroupId: null,
    nextOffset: null,
    loading: false,
    loaded: false,
    activePlaylistId: null,
    pendingTrack: null,
    refreshTimer: null,
    observer: null
  };

  const API_MESSAGES = {
    unauthorized: "Open Taalune from the Telegram bot to sign in.",
    invalid_chat_id: "That Telegram group ID is invalid.",
    invalid_pagination: "Group list request is invalid.",
    group_only: "Enter a Telegram supergroup ID.",
    supergroup_required: "This group must be a supergroup.",
    bot_cannot_access_group: "The music bot cannot access this group.",
    assistant_unavailable: "The assigned music assistant is unavailable.",
    userbot_cannot_verify_membership: "The assigned assistant could not verify your group membership.",
    not_group_member: "This group is hidden because you are not a member.",
    bot_not_in_group: "Add the music bot to this group first.",
    assistant_not_in_group: "The assigned playback assistant is not in this group.",
    unable_to_verify_group_clients: "Could not verify the bot and assistant in this group.",
    group_control_permission_denied: "You can view this group, but only its admins, authorized users, or global bot staff can control playback.",
    authorization_check_failed: "Could not verify this group's authorization list.",
    global_permission_check_failed: "Could not verify global owner/sudo permissions.",
    group_list_unavailable: "Could not load your Telegram groups.",
    group_registration_failed: "The group was verified but could not be saved for future listing.",
    voice_chat_playback_not_started: "Voice chat playback could not start.",
    nothing_playing: "Nothing is playing in this group.",
    already_paused: "Group playback is already paused.",
    already_playing: "Group playback is already playing.",
    group_queue_limit: "Group queue is full.",
    playlist_empty: "This playlist has no songs.",
    playlist_not_found: "Playlist was not found.",
    private_playlist: "You do not have access to this playlist.",
    social_storage_unavailable: "Playlist storage is temporarily unavailable.",
    track_required: "Song details are unavailable.",
    invalid_track_id: "This song has an invalid YouTube ID.",
    invalid_duration: "This song has an invalid duration.",
    invalid_text: "Song details are invalid.",
    invalid_text_length: "Song title or artist is too long or empty.",
    invalid_url: "Song artwork URL is invalid.",
    https_url_required: "Song artwork must use HTTPS.",
    unsupported_group_action: "This group action is not supported.",
    group_control_failed: "The group playback action could not be completed.",
    group_internal_error: "The group request failed. Please try again."
  };

  const esc = value => String(value ?? "").replace(
    /[&<>"']/g,
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]
  );

  function toast(message) {
    const element = $("toast");
    if (element) {
      element.textContent = String(message || "Something went wrong.");
      element.classList.add("show");
      clearTimeout(toast._timer);
      toast._timer = setTimeout(() => element.classList.remove("show"), 2800);
      return;
    }
    window.alert(String(message || "Something went wrong."));
  }

  async function api(path, options = {}) {
    if (!initData) {
      throw new Error("Open Taalune from the Telegram bot to sign in.");
    }

    const headers = {
      "X-Telegram-Init-Data": initData,
      ...(options.headers || {})
    };

    if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    let response;
    try {
      response = await fetch(path, { ...options, headers });
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      throw new Error("Network connection failed. Please try again.");
    }

    let data = {};
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try { data = await response.json(); } catch (_) {}
    }

    if (!response.ok || data.ok === false) {
      const code = data.error || "";
      throw new Error(
        API_MESSAGES[code] ||
        data.message ||
        code ||
        `Request failed (${response.status}).`
      );
    }

    return data;
  }

  function injectStyles() {
    if ($("taaluneGroupPlayerStyles")) return;

    const style = document.createElement("style");
    style.id = "taaluneGroupPlayerStyles";
    style.textContent = `
      #page-groups .tp-group-intro{margin:8px 0 16px;color:var(--muted);font-size:11px;line-height:1.65}
      #page-groups .tp-connect{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;align-items:end;padding:13px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.025)}
      #page-groups .tp-connect .field{margin:0;min-width:0}
      #page-groups .tp-connect input{width:100%;height:43px;padding:10px 12px;border:1px solid var(--line-strong);border-radius:11px;background:rgba(255,255,255,.045);color:var(--text);font:inherit;font-size:12px}
      #page-groups .tp-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:24px 0 9px}
      #page-groups .tp-groups{display:grid;gap:12px;margin-top:12px}
      #page-groups .tp-group-card{min-width:0;padding:14px;border:1px solid var(--line);border-radius:17px;background:rgba(255,255,255,.025)}
      #page-groups .tp-group-card.selected{border-color:rgba(234,182,216,.48);background:rgba(234,182,216,.045)}
      #page-groups .tp-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
      #page-groups .tp-card-title{min-width:0;flex:1;font-size:14px;font-weight:850;overflow-wrap:anywhere}
      #page-groups .tp-card-meta{margin-top:5px;color:var(--muted);font-size:10px;line-height:1.5;overflow-wrap:anywhere}
      #page-groups .tp-pill{flex:0 0 auto;padding:5px 9px;border:1px solid var(--line);border-radius:999px;font-size:10px;white-space:nowrap;color:var(--muted)}
      #page-groups .tp-pill.playing{color:var(--success);border-color:rgba(142,216,189,.25);background:rgba(142,216,189,.07)}
      #page-groups .tp-pill.paused{color:var(--warning);border-color:rgba(237,201,138,.25);background:rgba(237,201,138,.07)}
      #page-groups .tp-current{display:flex;align-items:center;gap:10px;min-width:0;margin-top:14px;padding-top:12px;border-top:1px solid var(--line)}
      #page-groups .tp-current img{width:44px;height:44px;flex:0 0 44px;object-fit:cover;border-radius:9px;background:var(--surface-3)}
      #page-groups .tp-current-copy{min-width:0;flex:1}
      #page-groups .tp-current-title{font-size:11px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #page-groups .tp-current-sub{margin-top:3px;color:var(--muted);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #page-groups .tp-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}
      #page-groups .tp-actions button{min-height:36px}
      #page-groups .tp-queue{margin-top:13px;padding-top:11px;border-top:1px solid var(--line)}
      #page-groups .tp-queue-row{display:flex;align-items:center;gap:9px;padding:7px 0;min-width:0}
      #page-groups .tp-queue-row+.tp-queue-row{border-top:1px solid rgba(255,255,255,.04)}
      #page-groups .tp-queue-name{min-width:0;flex:1;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #page-groups .tp-queue-sub{margin-top:2px;color:var(--muted);font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #page-groups .tp-note{margin-top:10px;color:var(--muted);font-size:10px;line-height:1.55}
      #page-groups .tp-error{color:var(--danger)}
      #page-groups .tp-load-more{width:100%;margin-top:13px}
      [data-tp-group-button]{width:32px;height:34px;padding:0;display:inline-grid;place-items:center;border-radius:10px;background:rgba(234,182,216,.10);color:var(--accent);flex:0 0 auto}
      [data-tp-group-button] svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      [data-action="group-play-track"],[data-action="group-track"]{display:none!important}
      .tp-sheet-note{padding:11px 12px;border:1px solid var(--line);border-radius:11px;background:rgba(255,255,255,.035);color:var(--muted);font-size:11px;line-height:1.55}
      #miniCover,#fullCover,.mini-cover,.player-art{transform:none!important;animation:none!important;transition:opacity .16s ease!important;will-change:auto!important}
      .player-art-wrap{transform:none!important}
      #fullPlayer.open{animation:tp-player-fade .2s ease both!important}
      @keyframes tp-player-fade{from{opacity:0}to{opacity:1}}
      @media(max-width:480px){#page-groups .tp-connect{grid-template-columns:minmax(0,1fr)}#page-groups .tp-group-card{padding:12px}}
    `;
    document.head.appendChild(style);
  }

  function preventSameImageReload() {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
    if (!descriptor?.get || !descriptor?.set || !descriptor.configurable) return;
    if (window.__taaluneImageSrcPatched) return;
    window.__taaluneImageSrcPatched = true;

    Object.defineProperty(HTMLImageElement.prototype, "src", {
      configurable: true,
      enumerable: descriptor.enumerable,
      get() {
        return descriptor.get.call(this);
      },
      set(value) {
        const next = String(value ?? "");
        const current = this.getAttribute("src") || "";
        if (!next && !current) return;
        if (next && current) {
          try {
            const oldUrl = new URL(descriptor.get.call(this), document.baseURI).href;
            const newUrl = new URL(next, document.baseURI).href;
            if (oldUrl === newUrl) return;
          } catch (_) {
            if (current === next) return;
          }
        }
        descriptor.set.call(this, next);
      }
    });
  }

  function formatTime(value) {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
    return `${minutes}:${String(rest).padStart(2, "0")}`;
  }

  function parseDuration(text) {
    const value = String(text || "").trim();
    const match = /^(\d{1,3}):(\d{2})(?::(\d{2}))?$/.exec(value);
    if (!match) return 0;
    if (match[3] !== undefined) {
      return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    }
    return Number(match[1]) * 60 + Number(match[2]);
  }

  function groupById(chatId) {
    return state.groups.get(String(chatId)) || null;
  }

  function selectedGroup() {
    return state.selectedGroupId ? groupById(state.selectedGroupId) : null;
  }

  function saveSelectedGroup() {
    try {
      if (state.selectedGroupId) {
        localStorage.setItem(selectedStorageKey, String(state.selectedGroupId));
      } else {
        localStorage.removeItem(selectedStorageKey);
      }
    } catch (_) {}
  }

  function setSelectedGroup(chatId) {
    const group = groupById(chatId);
    if (!group) throw new Error("This group is no longer available.");
    state.selectedGroupId = String(group.chat_id);
    saveSelectedGroup();
    renderGroupCards();
    enhanceTrackRows();
    enhancePlaylistActions();
    toast(`Selected ${group.title || "Telegram group"}`);
  }

  function formatRole(group) {
    const roles = {
      global_operator: "Global owner / sudo",
      group_admin: "Group administrator",
      authorized: "Authorized by /auth",
      view_only: "Member · view only"
    };
    return roles[group.access_role] || "Member";
  }

  function groupCardHTML(group) {
    const id = String(group.chat_id);
    const selected = id === String(state.selectedGroupId || "");
    const statusClass = group.active
      ? (group.playing ? "playing" : "paused")
      : "";
    const statusText = group.active
      ? (group.playing ? "Playing" : "Paused")
      : "Idle";
    const current = group.current;
    const currentHTML = current ? `
      <div class="tp-current">
        ${current.thumbnail ? `<img src="${esc(current.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="track-cover cover-placeholder">♪</div>`}
        <div class="tp-current-copy">
          <div class="tp-current-title">${esc(current.title)}</div>
          <div class="tp-current-sub">${esc(current.artist || "Unknown artist")} · ${formatTime(current.duration_sec)}</div>
        </div>
      </div>
    ` : `<div class="tp-note">Nothing is playing in this group.</div>`;

    const queueHTML = (group.queue || []).slice(0, 4).map((track, index) => `
      <div class="tp-queue-row">
        <span class="muted small">${index + 1}</span>
        <div class="tp-queue-name">
          ${esc(track.title)}
          <div class="tp-queue-sub">${esc(track.artist || "Unknown artist")} · ${formatTime(track.duration_sec)}</div>
        </div>
      </div>
    `).join("");

    const controls = group.can_control ? (group.active ? `
      <button class="secondary-button" data-tp-action="control" data-chat-id="${esc(id)}" data-command="${group.playing ? "pause" : "resume"}">${group.playing ? "Ⅱ Pause" : "▶ Resume"}</button>
      <button class="secondary-button" data-tp-action="control" data-chat-id="${esc(id)}" data-command="skip">Next</button>
      <button class="danger-button" data-tp-action="control" data-chat-id="${esc(id)}" data-command="stop">Stop</button>
    ` : `<span class="tp-note">Select this group, then send a song or playlist to start group playback.</span>`) : `
      <span class="tp-note">View-only access. Playback control requires group admin or /auth permission.</span>
    `;

    return `
      <article class="tp-group-card ${selected ? "selected" : ""}" data-tp-group-card="${esc(id)}">
        <div class="tp-card-head">
          <div style="min-width:0;flex:1">
            <div class="tp-card-title">${esc(group.title || "Telegram group")}</div>
            <div class="tp-card-meta">${esc(id)} · Assistant ${esc(group.assistant_id)}</div>
            <div class="tp-card-meta">${esc(formatRole(group))}${group.is_member === false ? " · Membership bypassed for global staff" : ""}</div>
          </div>
          <span class="tp-pill ${statusClass}">${statusText}</span>
        </div>

        ${currentHTML}

        <div class="tp-actions">
          <button class="${selected ? "primary-button" : "secondary-button"}" data-tp-action="select-group" data-chat-id="${esc(id)}">${selected ? "Selected target" : "Use this group"}</button>
          <button class="secondary-button" data-tp-action="refresh-group" data-chat-id="${esc(id)}" aria-label="Refresh group">↻</button>
          ${controls}
        </div>

        <div class="tp-queue">
          <div class="row" style="justify-content:space-between">
            <span class="eyebrow">UP NEXT</span>
            <span class="muted small">${Number(group.queue_count || 0)} songs</span>
          </div>
          ${queueHTML || `<div class="tp-note">The group queue is empty.</div>`}
        </div>
      </article>
    `;
  }

  function renderGroupCards() {
    const target = $("tpGroupCards");
    if (!target) return;

    target.innerHTML = state.groups.size
      ? Array.from(state.groups.values()).map(groupCardHTML).join("")
      : `<div class="empty">${state.loading ? "Loading your groups…" : "No accessible groups found. Add the music bot and its assigned assistant to a group, then connect it by ID."}</div>`;

    const more = $("tpLoadMore");
    if (more) more.hidden = state.nextOffset === null;
    enhanceTrackRows();
    enhancePlaylistActions();
  }

  function renderGroupsPage() {
    const page = $("page-groups");
    if (!page) return;

    page.innerHTML = `
      <div class="eyebrow">TELEGRAM VOICE CHATS</div>
      <h1 class="page-title">Group player</h1>
      <p class="tp-group-intro">Every Telegram group has its own voice-chat session and queue. Personal listening stays separate. Only group members can see a group; configured bot owner and sudo users can access saved groups.</p>

      <div class="tp-connect">
        <div class="field">
          <label for="tpGroupId">CONNECT A GROUP BY ID</label>
          <input id="tpGroupId" inputmode="numeric" maxlength="20" placeholder="Supergroup ID · -100…">
        </div>
        <button class="primary-button" data-tp-action="connect-group">Connect group</button>
      </div>

      <div class="tp-heading">
        <h2>Your groups</h2>
        <button class="secondary-button" data-tp-action="reload-groups">↻ Reload</button>
      </div>

      <div class="muted small">You can view the queue as a member. Playback controls require administrator or authorization permissions.</div>
      <div id="tpGroupCards" class="tp-groups"><div class="empty">Loading your groups…</div></div>
      <button id="tpLoadMore" class="secondary-button tp-load-more" data-tp-action="load-more" hidden>Load more groups</button>
    `;

    renderGroupCards();
  }

  function showGroupsPage() {
    document.querySelectorAll(".page").forEach(page => {
      page.classList.toggle("active", page.id === "page-groups");
    });
    document.querySelectorAll(".nav-button").forEach(button => {
      button.classList.toggle("active", button.dataset.page === "groups");
    });
    window.scrollTo({ top: 0, behavior: "auto" });
    renderGroupsPage();
    if (!state.loaded && !state.loading) loadGroups(true);
  }

  function upsertGroup(group) {
    if (!group || group.chat_id === undefined) return null;
    const id = String(group.chat_id);
    state.groups.set(id, group);
    return group;
  }

  function updateGroupCard(group) {
    const id = String(group.chat_id);
    const signature = JSON.stringify(group);
    if (state.signatures.get(id) === signature) return;
    state.signatures.set(id, signature);

    const current = document.querySelector(`[data-tp-group-card="${CSS.escape(id)}"]`);
    if (current) {
      current.outerHTML = groupCardHTML(group);
    } else if ($("tpGroupCards")) {
      renderGroupCards();
    }
    enhanceTrackRows();
    enhancePlaylistActions();
  }

  async function loadGroups(reset = false) {
    if (state.loading) return;
    const offset = reset ? 0 : state.nextOffset;
    if (!reset && offset === null) return;

    state.loading = true;
    if (reset) {
      state.groups.clear();
      state.signatures.clear();
      state.nextOffset = 0;
    }
    renderGroupCards();

    try {
      const data = await api(`/api/groups?limit=20&offset=${Number(offset) || 0}`);
      for (const group of (Array.isArray(data.groups) ? data.groups : [])) {
        upsertGroup(group);
      }
      state.nextOffset = data.next_offset === null || data.next_offset === undefined
        ? null
        : Number(data.next_offset);
      state.loaded = true;

      if (state.selectedGroupId && !groupById(state.selectedGroupId)) {
        state.selectedGroupId = null;
      }
      if (!state.selectedGroupId && state.groups.size) {
        const preferred = Array.from(state.groups.values()).find(group => group.can_control)
          || state.groups.values().next().value;
        state.selectedGroupId = String(preferred.chat_id);
      }
      saveSelectedGroup();
      renderGroupCards();

    } catch (error) {
      state.loaded = false;
      const target = $("tpGroupCards");
      if (target) target.innerHTML = `<div class="empty tp-error">${esc(error.message)}</div>`;
      toast(error.message);
    } finally {
      state.loading = false;
      const more = $("tpLoadMore");
      if (more) more.hidden = state.nextOffset === null;
      enhanceTrackRows();
      enhancePlaylistActions();
    }
  }

  async function connectGroup() {
    const input = $("tpGroupId");
    const raw = input?.value.trim() || "";
    if (!/^-100\d{6,13}$/.test(raw)) {
      toast("Enter a valid Telegram supergroup ID starting with -100.");
      return;
    }
    const chatId = Number(raw);
    if (!Number.isSafeInteger(chatId)) {
      toast("This group ID is not supported.");
      return;
    }

    try {
      const data = await api(`/api/groups/${encodeURIComponent(chatId)}/status`);
      upsertGroup(data.group);
      state.selectedGroupId = String(chatId);
      saveSelectedGroup();
      await loadGroups(true);
      toast("Group connected successfully.");
    } catch (error) {
      toast(error.message);
    }
  }

  async function refreshGroup(chatId) {
    const id = String(chatId || "");
    if (!id) throw new Error("Select a group first.");
    const data = await api(`/api/groups/${encodeURIComponent(id)}/status`);
    const group = upsertGroup(data.group);
    updateGroupCard(group);
    return group;
  }

  async function controlGroup(chatId, action, payload = {}) {
    const group = groupById(chatId);
    if (!group) throw new Error("This group is no longer available.");
    if (!group.can_control) throw new Error(API_MESSAGES.group_control_permission_denied);

    const result = await api(`/api/groups/${encodeURIComponent(chatId)}/control`, {
      method: "POST",
      body: JSON.stringify({ action, ...payload })
    });

    if (result.status === "queued") {
      const position = result.position ?? result.first_position;
      toast(`Added to group queue${position !== undefined ? ` · position ${Number(position) + 1}` : ""}`);
    } else if (result.status === "playing") {
      toast("Group playback started.");
    } else if (action === "stop") {
      toast("Group playback stopped.");
    } else {
      toast("Group playback updated.");
    }

    await refreshGroup(chatId);
    return result;
  }

  function openSheet(title, body, actions) {
    const overlay = $("sheetOverlay");
    if (!overlay) return false;
    $("sheetTitle").textContent = title;
    $("sheetBody").innerHTML = body;
    $("sheetActions").innerHTML = actions;
    overlay.classList.add("open");
    return true;
  }

  function closeSheet() {
    $("sheetOverlay")?.classList.remove("open");
    state.pendingTrack = null;
  }

  function trackFromRow(row, fallbackId = "") {
    if (!row) throw new Error("Song details are unavailable.");
    const id = String(row.dataset.trackId || fallbackId || "").trim();
    if (!id) throw new Error("Song details are unavailable.");

    const title = row.querySelector(".track-title")?.textContent?.trim() || "Unknown track";
    const sub = row.querySelector(".track-sub")?.textContent?.trim() || "Unknown artist";
    const durationMatch = /\s·\s(\d{1,3}:\d{2}(?::\d{2})?)$/.exec(sub);
    const duration = durationMatch ? durationMatch[1] : "";
    const artist = durationMatch ? sub.slice(0, durationMatch.index).trim() : sub;
    const thumbnail = row.querySelector("img.track-cover")?.getAttribute("src") || null;

    return {
      id,
      title: title.slice(0, 160),
      artist: (artist || "Unknown artist").slice(0, 160),
      duration_sec: parseDuration(duration),
      thumbnail
    };
  }

  function openTrackActions(track) {
    const group = selectedGroup();
    if (!group) throw new Error("Select a Telegram group first.");
    if (!group.can_control) throw new Error(API_MESSAGES.group_control_permission_denied);
    state.pendingTrack = track;

    openSheet(
      "Send to group",
      `
        <div class="track-row">
          ${track.thumbnail ? `<img class="track-cover" src="${esc(track.thumbnail)}" alt="">` : `<div class="track-cover cover-placeholder">♪</div>`}
          <div class="track-copy">
            <div class="track-title">${esc(track.title)}</div>
            <div class="track-sub">${esc(track.artist)}</div>
          </div>
        </div>
        <div class="tp-sheet-note">Target group: <strong>${esc(group.title || group.chat_id)}</strong></div>
      `,
      `
        <button class="secondary-button" data-tp-action="close-sheet">Cancel</button>
        <button class="secondary-button" data-tp-action="queue-track">＋ Queue</button>
        <button class="primary-button" data-tp-action="play-track">▶ Play now</button>
      `
    );
  }

  async function playTrackInGroup(mode) {
    const track = state.pendingTrack;
    const group = selectedGroup();
    if (!track || !group) throw new Error("Song or selected group is unavailable.");
    closeSheet();
    await controlGroup(
      String(group.chat_id),
      mode === "play" ? "play_track" : "queue_track",
      { track }
    );
  }

  function enhanceTrackRows(root = document) {
    const rows = [];
    if (root instanceof Element && root.matches(".track-row[data-track-id]")) rows.push(root);
    if (root.querySelectorAll) rows.push(...root.querySelectorAll(".track-row[data-track-id]"));

    const group = selectedGroup();
    for (const row of rows) {
      row.querySelectorAll('[data-action="group-play-track"],[data-action="group-track"]').forEach(button => {
        button.hidden = true;
        button.setAttribute("aria-hidden", "true");
      });

      const actions = row.querySelector(".track-actions");
      let button = row.querySelector("[data-tp-group-button]");
      if (!actions || !group?.can_control) {
        button?.remove();
        continue;
      }
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "track-action";
        button.dataset.tpGroupButton = "true";
        button.dataset.tpAction = "track-menu";
        button.setAttribute("aria-label", "Send song to selected Telegram group");
        button.title = `Send to ${group.title || "selected group"}`;
        button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"></path></svg>';
        const personalPlay = actions.querySelector('[data-action="play-track"]');
        actions.insertBefore(button, personalPlay || null);
      }
      button.title = `Send to ${group.title || "selected group"}`;
    }
  }

  function enhancePlaylistActions(root = document) {
    const page = $("page-playlist");
    if (!page) return;
    const group = selectedGroup();
    const actions = page.querySelector(".detail-actions");
    if (!actions) return;

    actions.querySelectorAll('[data-action="group-play-playlist"],[data-action="group-queue-playlist"]').forEach(button => {
      button.hidden = true;
      button.setAttribute("aria-hidden", "true");
    });

    actions.querySelectorAll("[data-tp-playlist-action]").forEach(button => button.remove());
    if (!group?.can_control || !state.activePlaylistId) return;

    const play = document.createElement("button");
    play.type = "button";
    play.className = "secondary-button";
    play.dataset.tpAction = "playlist-play";
    play.dataset.tpPlaylistAction = "true";
    play.innerHTML = "▶ Play in group";

    const queueButton = document.createElement("button");
    queueButton.type = "button";
    queueButton.className = "secondary-button";
    queueButton.dataset.tpAction = "playlist-queue";
    queueButton.dataset.tpPlaylistAction = "true";
    queueButton.innerHTML = "＋ Queue in group";

    actions.append(play, queueButton);
  }

  async function playPlaylistInGroup(mode) {
    const group = selectedGroup();
    if (!group) throw new Error("Select a Telegram group first.");
    if (!state.activePlaylistId) throw new Error("Open a playlist first.");
    await controlGroup(
      String(group.chat_id),
      mode === "play" ? "play_playlist" : "queue_playlist",
      { playlist_id: state.activePlaylistId }
    );
  }

  function openGroupPageIfNeeded() {
    if (document.querySelector("#page-groups.active")) {
      renderGroupCards();
    }
  }

  async function refreshVisibleActiveGroups() {
    if (!document.querySelector("#page-groups.active")) return;
    const active = Array.from(state.groups.values()).filter(group => group.active).slice(0, 2);
    await Promise.allSettled(active.map(group => refreshGroup(group.chat_id)));
  }

  async function handleCustomAction(button) {
    const action = button.dataset.tpAction;
    const chatId = button.dataset.chatId || state.selectedGroupId;

    if (action === "select-group") {
      setSelectedGroup(chatId);
    } else if (action === "refresh-group") {
      await refreshGroup(chatId);
      toast("Group status updated.");
    } else if (action === "control") {
      await controlGroup(chatId, button.dataset.command);
    } else if (action === "reload-groups") {
      await loadGroups(true);
      toast("Group list refreshed.");
    } else if (action === "load-more") {
      await loadGroups(false);
    } else if (action === "connect-group") {
      await connectGroup();
    } else if (action === "track-menu") {
      const row = button.closest(".track-row[data-track-id]");
      openTrackActions(trackFromRow(row));
    } else if (action === "play-track") {
      await playTrackInGroup("play");
    } else if (action === "queue-track") {
      await playTrackInGroup("queue");
    } else if (action === "playlist-play") {
      await playPlaylistInGroup("play");
    } else if (action === "playlist-queue") {
      await playPlaylistInGroup("queue");
    } else if (action === "close-sheet") {
      closeSheet();
    }
  }

  function onDocumentClick(event) {
    const customButton = event.target.closest("[data-tp-action]");
    if (customButton) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      handleCustomAction(customButton).catch(error => toast(error.message));
      return;
    }

    const groupNav = event.target.closest('[data-page="groups"]');
    if (groupNav) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      showGroupsPage();
      return;
    }

    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;
    const action = actionButton.dataset.action;

    // Remember the playlist clicked in the existing Taalune renderer.
    if (action === "open-playlist") {
      state.activePlaylistId = actionButton.dataset.id || null;
      return;
    }

    if (action === "check-group") {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      connectGroup().catch(error => toast(error.message));
    } else if (action === "disconnect-group") {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      state.selectedGroupId = null;
      saveSelectedGroup();
      renderGroupCards();
      enhanceTrackRows();
      enhancePlaylistActions();
      toast("Selected group cleared.");
    } else if (action === "refresh-group") {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      refreshGroup(actionButton.dataset.chatId || state.selectedGroupId)
        .then(() => toast("Group status updated."))
        .catch(error => toast(error.message));
    } else if (action === "group-control") {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      controlGroup(
        actionButton.dataset.chatId || state.selectedGroupId,
        actionButton.dataset.command
      ).catch(error => toast(error.message));
    } else if (action === "group-play-track" || action === "group-track") {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      const row = actionButton.closest(".track-row[data-track-id]");
      try {
        const track = trackFromRow(row, actionButton.dataset.id);
        openTrackActions(track);
      } catch (error) {
        toast(error.message);
      }
    } else if (action === "group-play-playlist" || action === "group-queue-playlist") {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      playPlaylistInGroup(action === "group-play-playlist" ? "play" : "queue")
        .catch(error => toast(error.message));
    }
  }

  function onDocumentKeydown(event) {
    if (event.key !== "Enter" || event.target?.id !== "tpGroupId") return;
    event.preventDefault();
    event.stopPropagation();
    connectGroup().catch(error => toast(error.message));
  }

  function startObserver() {
    if (state.observer || !document.body) return;
    state.observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            enhanceTrackRows(node);
          }
        }
      }
      enhancePlaylistActions();
    });
    state.observer.observe(document.body, { childList: true, subtree: true });
    enhanceTrackRows();
    enhancePlaylistActions();
  }

  function start() {
    injectStyles();
    preventSameImageReload();
    startObserver();

    try {
      const saved = localStorage.getItem(selectedStorageKey);
      if (saved && /^-100\d{6,13}$/.test(saved)) {
        state.selectedGroupId = saved;
      }
    } catch (_) {}

    document.addEventListener("click", onDocumentClick, true);
    document.addEventListener("keydown", onDocumentKeydown, true);

    if (initData) {
      loadGroups(true);
      state.refreshTimer = setInterval(() => {
        refreshVisibleActiveGroups().catch(error => {
          console.warn("Taalune group refresh failed:", error.message);
        });
      }, 30000);
    }

    window.addEventListener("pagehide", () => {
      if (state.refreshTimer) clearInterval(state.refreshTimer);
      state.observer?.disconnect();
    }, { once: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();