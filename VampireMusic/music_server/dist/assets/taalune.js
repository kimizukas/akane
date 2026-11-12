(() => {
  "use strict";

  const tg = window.Telegram?.WebApp || null;
  const initData = tg?.initData || "";
  const $ = (id) => document.getElementById(id);
  const audio = $("audio");

  const API_MESSAGES = {
    telegram_authentication_required: "Open Taalune from the Telegram bot to sign in.",
    invalid_or_expired_access_token: "Your session has expired. Reopen Taalune from Telegram.",
    social_storage_unavailable: "Music storage is temporarily unavailable.",
    profile_not_found: "Your profile could not be found.",
    user_not_found: "That profile is not available.",
    private_profile: "This profile is private.",
    private_playlist: "You do not have access to this playlist.",
    playlist_not_found: "This playlist is no longer available.",
    playlist_version_conflict: "This playlist changed. Reload it and try again.",
    playlist_changed_retry: "This playlist changed. Reload it and try again.",
    invitation_not_found: "This invitation is no longer available.",
    collaborator_limit_reached: "This playlist has reached its collaborator limit.",
    playlist_limit_reached: "You have reached your playlist limit.",
    playlist_track_limit: "This playlist has reached its song limit.",
    duplicate_track: "This song is already in the playlist.",
    permission_denied: "You do not have permission for this action.",
    owner_only: "This section is available to the bot owner only.",
    nothing_playing: "Nothing is playing in this group.",
    already_paused: "Group playback is already paused.",
    already_playing: "Group playback is already playing.",
    group_only: "Enter a Telegram supergroup ID.",
    supergroup_required: "This group must be a supergroup.",
    bot_cannot_access_group: "The music bot cannot access this group.",
    assistant_unavailable: "The assigned music assistant is unavailable.",
    not_group_member: "You are not a member of this group.",
    group_control_permission_denied: "You can view this group, but cannot control playback.",
    group_queue_limit: "The group queue is full.",
    playlist_empty: "This playlist has no songs.",
    stream_unavailable: "This song is currently unavailable.",
    stream_unavailable_after_refresh: "The audio source expired and could not be refreshed.",
    search_failed: "Music search failed. Try again.",
    image_too_large: "Image must be 5 MB or smaller.",
    unsupported_image: "Use a valid JPG, PNG or WebP image.",
    upload_rate_limited: "Wait a few seconds before uploading again.",
    account_unavailable: "This account is not available.",
    deletion_confirmation_mismatch: "Type DELETE exactly to confirm account deletion.",
    report_rate_limit: "You have sent too many reports. Try again later.",
    invalid_track_id: "That song identifier is invalid."
  };

  const state = {
    page: "home",
    profile: null,
    accessToken: "",
    refreshToken: "",
    activePerson: null,
    activePlaylist: null,
    playlists: [],
    discover: [],
    fresh: [],
    liked: [],
    likedLoaded: false,
    history: [],
    notifications: [],
    settings: null,
    privacy: null,
    blocks: [],
    reports: [],
    searchMode: "music",
    searchQuery: "",
    searchResults: [],
    searchRequest: 0,
    libraryScope: "mine",
    groups: [],
    groupOffset: null,
    selectedGroup: null,
    groupStatus: null,
    currentTrack: null,
    queue: [],
    queueIndex: -1,
    playbackRequest: 0,
    playbackLoading: false,
    streamRecoveryAttempted: false,
    shuffle: false,
    shuffleBag: [],
    repeatMode: 0,
    lastHistoryTrackId: "",
    lastHistoryRecorded: false,
    sleepTimer: null,
    sleepTimerEndsAt: 0,
    toastTimer: null,
    searchTimer: null,
    groupRefreshTimer: null,
    modalTrack: null,
    modalTargetPlaylistId: "",
    modalTargetPlaylist: null,
    activeUpload: null,
    profileVisibility: "public",
    groupBusy: false
  };

  const ICONS = {
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    search: '<circle cx="10.8" cy="10.8" r="7.2"/><path d="m16.2 16.2 4.3 4.3"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    library: '<path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h5"/>',
    heart: '<path d="M20.8 8.8c0 5.2-8.8 11-8.8 11S3.2 14 3.2 8.8A4.8 4.8 0 0 1 12 6.2a4.8 4.8 0 0 1 8.8 2.6Z"/>',
    heartFill: '<path fill="currentColor" stroke="none" d="M20.8 8.8c0 5.2-8.8 11-8.8 11S3.2 14 3.2 8.8A4.8 4.8 0 0 1 12 6.2a4.8 4.8 0 0 1 8.8 2.6Z"/>',
    play: '<path fill="currentColor" stroke="none" d="M7 4.8c0-.8.9-1.3 1.6-.9l11 7.2a1.1 1.1 0 0 1 0 1.8l-11 7.2c-.7.4-1.6-.1-1.6-.9z"/>',
    pause: '<path d="M8 5h3v14H8zM15 5h3v14h-3z"/>',
    next: '<path d="M5 5v14l10-7zM19 5v14"/>',
    previous: '<path d="M19 5v14L9 12zM5 5v14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    refresh: '<path d="M20 7v5h-5M20 12a8 8 0 1 1-2.3-5.7L20 9"/>',
    upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2m-10 0 1 14h10l1-14M10 10v6m4-6v6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    shuffle: '<path d="m16 3 4 4-4 4M4 17l5-5 3-3 4-3h4M16 17l4 4-4 4M4 7l5 5 3 3"/>',
    repeat: '<path d="m17 1 4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    moon: '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z"/>',
    flag: '<path d="M5 21V4m0 0c6-4 8 4 14 0v11c-6 4-8-4-14 0"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1a1.7 1.7 0 1 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 1 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1A1.7 1.7 0 0 0 4.2 12h-.2a1.7 1.7 0 1 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 1 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2v-.2a1.7 1.7 0 1 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 1 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z"/>'
  };

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);

  function icon(name, size = 18) {
    return `<svg width="${Number(size) || 18}" height="${Number(size) || 18}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.music}</svg>`;
  }

  function formatTime(value) {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  }

  function showToast(message) {
    const el = $("toast");
    if (!el) return;
    el.textContent = String(message || "Something went wrong.");
    el.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
  }

  function normalizeError(data, status) {
    const code = data?.error || data?.detail?.error || data?.detail || "";
    const message = data?.message || API_MESSAGES[code] || (typeof code === "string" ? code.replaceAll("_", " ") : "") || `Request failed (${status}).`;
    const error = new Error(message);
    error.status = Number(status) || 0;
    error.code = typeof code === "string" ? code : "request_failed";
    return error;
  }

  async function readResponse(response) {
    const type = response.headers.get("content-type") || "";
    let data = {};
    if (type.includes("application/json")) {
      try { data = await response.json(); } catch (_) { data = {}; }
    } else if (!response.ok) {
      data = { error: `Request failed (${response.status}).` };
    }
    if (!response.ok || data.ok === false) throw normalizeError(data, response.status);
    return data;
  }

  async function rawRequest(path, options = {}, token = "") {
    const headers = new Headers(options.headers || {});
    const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
    if (options.body && !isForm && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    try {
      const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
      return await readResponse(response);
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      if (error instanceof TypeError) throw new Error("Network connection failed. Check your connection and try again.");
      throw error;
    }
  }

  async function createSession() {
    if (!initData) throw new Error("Open Taalune from the Telegram bot to sign in.");
    const data = await rawRequest("/api/auth/session", {
      method: "POST",
      headers: { "X-Telegram-Init-Data": initData }
    });
    state.accessToken = data.access_token || "";
    state.refreshToken = data.refresh_token || "";
    if (!state.accessToken || !state.refreshToken) throw new Error("Authentication service returned an incomplete session.");
    return data;
  }

  async function refreshSession() {
    if (!state.refreshToken) return createSession();
    try {
      const data = await rawRequest("/api/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refresh_token: state.refreshToken })
      });
      state.accessToken = data.access_token || "";
      state.refreshToken = data.refresh_token || "";
      if (!state.accessToken || !state.refreshToken) throw new Error("Session refresh returned incomplete tokens.");
      return data;
    } catch (_) {
      state.accessToken = "";
      state.refreshToken = "";
      return createSession();
    }
  }

  async function api(path, options = {}) {
    if (!state.accessToken) await createSession();
    try {
      return await rawRequest(path, options, state.accessToken);
    } catch (error) {
      if (error.status !== 401) throw error;
      await refreshSession();
      return rawRequest(path, options, state.accessToken);
    }
  }

  function emptyState(message, extra = "") {
    return `<div class="empty">${esc(message)}${extra}</div>`;
  }

  function image(url, className = "") {
    if (!url) return `<div class="${esc(className)} cover-placeholder">${icon("music", 22)}</div>`;
    return `<img class="${esc(className)}" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true">`;
  }

  function trackPayload(track) {
    return {
      id: String(track.id),
      title: String(track.title || "Unknown title").slice(0, 160),
      artist: String(track.artist || "Unknown artist").slice(0, 160),
      duration_sec: Math.max(0, Math.min(86400, Number(track.duration_sec) || 0)),
      thumbnail: track.thumbnail || null,
      url: track.url || null
    };
  }

  function isLiked(id) {
    return state.liked.some((item) => String(item.id) === String(id));
  }

  function findTrack(id) {
    const sources = [state.searchResults, state.liked, state.history, state.homeTracks || [], state.activePlaylist?.tracks || [], state.queue];
    for (const list of sources) {
      const found = list.find((item) => String(item.id) === String(id));
      if (found) return found;
    }
    return state.currentTrack && String(state.currentTrack.id) === String(id) ? state.currentTrack : null;
  }

  function trackRow(track, options = {}) {
    const id = String(track.id);
    const liked = isLiked(id);
    const groupAction = state.selectedGroup ? `
      <button class="track-action" data-action="group-track" data-id="${esc(id)}" title="Queue in selected group" aria-label="Queue in group">${icon("users", 16)}</button>` : "";
    const playlistActions = options.playlist && options.canEdit ? `
      <button class="track-action" data-action="playlist-track-up" data-index="${Number(options.index)}" title="Move up" aria-label="Move track up">↑</button>
      <button class="track-action" data-action="playlist-track-down" data-index="${Number(options.index)}" title="Move down" aria-label="Move track down">↓</button>
      <button class="track-action" data-action="playlist-track-remove" data-id="${esc(id)}" title="Remove from playlist" aria-label="Remove track">${icon("trash", 15)}</button>` : "";
    return `<article class="track-row" data-track-id="${esc(id)}">
      ${image(track.thumbnail, "track-cover")}
      <div class="track-copy"><div class="track-title">${esc(track.title || "Unknown title")}</div><div class="track-sub">${esc(track.artist || "Unknown artist")} · ${formatTime(track.duration_sec)}</div></div>
      <div class="track-actions">
        <button class="track-action" data-action="like-track" data-id="${esc(id)}" aria-label="${liked ? "Unlike" : "Like"} song" aria-pressed="${liked}">${icon(liked ? "heartFill" : "heart", 16)}</button>
        ${groupAction}
        ${playlistActions}
        <button class="play-circle" data-action="play-track" data-id="${esc(id)}" aria-label="Play song">${icon("play", 16)}</button>
        <button class="track-action" data-action="track-menu" data-id="${esc(id)}" aria-label="More song actions">${icon("more", 17)}</button>
      </div>
    </article>`;
  }

  function playlistCard(playlist) {
    const owner = playlist.owner || {};
    const own = Number(owner.user_id) === Number(state.profile?.user_id);
    return `<article class="playlist-card">
      <button class="playlist-open" data-action="open-playlist" data-id="${esc(playlist.id)}" aria-label="Open ${esc(playlist.name)}">
        ${image(playlist.cover_url, "playlist-cover")}
        <span class="playlist-title">${esc(playlist.name || "Untitled playlist")}</span>
        <span class="playlist-owner">by @${esc(owner.handle || "listener")}</span>
      </button>
      <div class="playlist-stats"><span>${Number(playlist.track_count || 0)} songs</span><span>${Number(playlist.like_count || 0)} likes</span></div>
      <div class="playlist-card-actions">
        ${own ? `<button class="track-action" data-action="open-playlist" data-id="${esc(playlist.id)}" title="Manage playlist">${icon("more", 16)}</button>` : `<button class="track-action" data-action="playlist-follow" data-id="${esc(playlist.id)}" title="${playlist.followed ? "Unfollow" : "Follow"}">${icon(playlist.followed ? "check" : "plus", 16)}</button>`}
      </div>
    </article>`;
  }

  function personRow(person) {
    const followState = person.follow_state || "";
    const label = followState === "accepted" ? "Following" : followState === "pending" ? "Requested" : "Follow";
    return `<article class="person-row">
      ${image(person.avatar_url, "person-avatar")}
      <div class="track-copy"><div class="track-title">${esc(person.display_name || "Listener")}</div><div class="track-sub">@${esc(person.handle || "listener")} · ${Number(person.followers || 0)} followers</div></div>
      <button class="secondary-button" data-action="follow-person" data-id="${esc(person.user_id)}" data-state="${esc(followState)}" data-visibility="${esc(person.visibility || "public")}">${label}</button>
      <button class="track-action" data-action="open-person" data-handle="${esc(person.handle)}" aria-label="Open profile">${icon("user", 17)}</button>
    </article>`;
  }

  function sectionHead(title, action = "", label = "") {
    return `<div class="section-head"><h2>${esc(title)}</h2>${action ? `<button data-action="${esc(action)}">${esc(label || "View all")}</button>` : ""}</div>`;
  }

  function setAvatar() {
    const avatar = $("topAvatar");
    const fallback = $("topAvatarFallback");
    if (!avatar || !fallback) return;
    const url = state.profile?.avatar_url || "";
    if (url) {
      avatar.src = url;
      avatar.hidden = false;
      fallback.hidden = true;
    } else {
      avatar.removeAttribute("src");
      avatar.hidden = true;
      fallback.textContent = (state.profile?.display_name?.[0] || "U").toUpperCase();
      fallback.hidden = false;
    }
  }

  function setPage(page) {
    const target = $(`page-${page}`);
    if (!target) return;
    state.page = page;
    document.querySelectorAll(".page").forEach((el) => el.classList.toggle("active", el.id === `page-${page}`));
    document.querySelectorAll(".nav-button").forEach((el) => el.classList.toggle("active", el.dataset.page === page));
    window.scrollTo({ top: 0, behavior: "auto" });
    closeModal();
    if (page === "home") loadHome();
    if (page === "search") renderSearch();
    if (page === "library") renderLibrary();
    if (page === "groups") renderGroups();
    if (page === "profile") renderProfile();
    if (page === "notifications") renderNotifications();
    if (page === "playlist") renderPlaylist();
    if (page === "person") renderPerson();
    if (page === "settings") renderSettings();
    if (page === "admin") renderAdmin();
  }

  function openModal(title, body, footer = "") {
    $("modalTitle").textContent = title;
    $("modalBody").innerHTML = body;
    $("modalFooter").innerHTML = footer;
    $("modalOverlay").classList.add("open");
    $("modalOverlay").setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    $("modalOverlay")?.classList.remove("open");
    $("modalOverlay")?.setAttribute("aria-hidden", "true");
    $("queueOverlay")?.classList.remove("open");
    $("queueOverlay")?.setAttribute("aria-hidden", "true");
  }

  function openQueue() {
    renderQueue();
    $("queueOverlay").classList.add("open");
    $("queueOverlay").setAttribute("aria-hidden", "false");
  }

  function renderQueue() {
    const currentIndex = state.queueIndex;
    $("queueCaption").textContent = `${state.queue.length} ${state.queue.length === 1 ? "track" : "tracks"}`;
    $("queueItems").innerHTML = state.queue.length ? state.queue.map((track, index) => `
      <article class="track-row ${index === currentIndex ? "queue-current" : ""}">
        ${image(track.thumbnail, "track-cover")}
        <div class="track-copy"><div class="track-title">${esc(track.title)}</div><div class="track-sub">${esc(track.artist || "Unknown artist")}${index === currentIndex ? " · Now playing" : ""}</div></div>
        <div class="track-actions">${index > currentIndex ? `<button class="track-action" data-action="queue-up" data-index="${index}" aria-label="Move up" ${index === currentIndex + 1 ? "disabled" : ""}>↑</button><button class="track-action" data-action="queue-down" data-index="${index}" aria-label="Move down" ${index === state.queue.length - 1 ? "disabled" : ""}>↓</button>` : ""}<button class="track-action" data-action="queue-play" data-index="${index}" aria-label="Play this track">${icon("play", 16)}</button><button class="track-action" data-action="queue-remove" data-index="${index}" aria-label="Remove from queue">${icon("close", 16)}</button></div>
      </article>`).join("") : emptyState("Your queue is empty.")
  }

  async function loadProfile() {
    const data = await api("/api/profile");
    state.profile = data.profile;
    state.profileVisibility = data.profile?.visibility || "public";
    setAvatar();
    return state.profile;
  }

  async function loadLiked() {
    const data = await api("/api/library/liked-tracks?limit=50");
    state.liked = Array.isArray(data.results) ? data.results : [];
    state.likedLoaded = true;
    return state.liked;
  }

  async function loadHome(force = false) {
    if (state.homeBusy && !force) return;
    state.homeBusy = true;
    const page = $("page-home");
    page.innerHTML = `<section class="hero-card"><div class="hero-content"><span class="eyebrow">Your listening space</span><h1>Music, without the noise.</h1><p>Discover tracks, build playlists and listen together in your Telegram groups.</p><div class="hero-actions"><button class="primary-button" data-page="search">${icon("search", 15)} Explore music</button><button class="secondary-button" data-page="library">Your library</button></div></div></section><section class="section"><div class="section-head"><h2>Your mix</h2><button data-action="refresh-home">Refresh</button></div><div id="homeTracks" class="list"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div></section><section class="section"><div class="section-head"><h2>Trending playlists</h2><button data-page="library">Discover</button></div><div id="homeTrending" class="grid"><div class="skeleton"></div><div class="skeleton"></div></div></section><section class="section"><div class="section-head"><h2>Recently added</h2></div><div id="homeFresh" class="grid"><div class="skeleton"></div><div class="skeleton"></div></div></section><section class="section"><div class="section-head"><h2>Your playlists</h2><button data-action="create-playlist">Create</button></div><div id="homeMine" class="grid"><div class="skeleton"></div></div></section>`;
    try {
      const results = await Promise.allSettled([
        api("/api/recommendations", { method: "POST", body: JSON.stringify({ intent: "for_you", count: 20 }) }),
        api("/api/playlists?scope=trending&limit=12"),
        api("/api/playlists?scope=fresh&limit=12"),
        api("/api/playlists?scope=mine&limit=12")
      ]);
      const [mix, trending, fresh, mine] = results;
      if (mix.status === "fulfilled") {
        state.homeTracks = mix.value.results || [];
        $("homeTracks").innerHTML = state.homeTracks.length ? state.homeTracks.map((t) => trackRow(t)).join("") : emptyState("No recommendations are available right now.");
      } else $("homeTracks").innerHTML = emptyState(mix.reason.message);
      if (trending.status === "fulfilled") {
        state.discover = trending.value.results || [];
        $("homeTrending").innerHTML = state.discover.length ? state.discover.map(playlistCard).join("") : emptyState("Public playlists will appear here.");
      } else $("homeTrending").innerHTML = emptyState(trending.reason.message);
      if (fresh.status === "fulfilled") {
        state.fresh = fresh.value.results || [];
        $("homeFresh").innerHTML = state.fresh.length ? state.fresh.map(playlistCard).join("") : emptyState("No new public playlists yet.");
      } else $("homeFresh").innerHTML = emptyState(fresh.reason.message);
      if (mine.status === "fulfilled") {
        state.playlists = mine.value.results || [];
        $("homeMine").innerHTML = state.playlists.length ? state.playlists.map(playlistCard).join("") : emptyState("Create your first playlist.");
      } else $("homeMine").innerHTML = emptyState(mine.reason.message);
    } finally {
      state.homeBusy = false;
    }
  }

  function renderSearch() {
    $("page-search").innerHTML = `<span class="eyebrow">Find something to play</span><h1 class="page-title">Search</h1><label class="search-box">${icon("search", 19)}<input id="searchInput" type="search" autocomplete="off" maxlength="160" placeholder="Songs, artists, people or playlists" value="${esc(state.searchQuery)}"></label><div class="pill-row" style="margin-top:13px"><button class="pill ${state.searchMode === "music" ? "active" : ""}" data-search-mode="music">Music</button><button class="pill ${state.searchMode === "playlists" ? "active" : ""}" data-search-mode="playlists">Playlists</button><button class="pill ${state.searchMode === "people" ? "active" : ""}" data-search-mode="people">People</button></div><p class="search-status" id="searchStatus">Search for music, creators or public playlists.</p><div id="searchResults" class="list"></div>`;
    if (state.searchQuery.trim().length >= 2) runSearch();
  }

  async function runSearch() {
    const input = $("searchInput");
    const target = $("searchResults");
    const status = $("searchStatus");
    if (!input || !target || !status) return;
    const query = input.value.trim();
    state.searchQuery = query;
    const requestId = ++state.searchRequest;
    if (query.length < 2) {
      state.searchResults = [];
      status.textContent = "Type at least two characters.";
      target.innerHTML = "";
      return;
    }
    status.textContent = "Searching…";
    target.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`;
    try {
      let data;
      if (state.searchMode === "music") {
        data = await api("/api/search", { method: "POST", body: JSON.stringify({ query, limit: 20 }) });
      } else {
        data = await api(`/api/search/${state.searchMode}?q=${encodeURIComponent(query)}&limit=25`);
      }
      if (requestId !== state.searchRequest) return;
      state.searchResults = data.results || [];
      if (state.searchMode === "music") {
        target.className = "list";
        target.innerHTML = state.searchResults.length ? state.searchResults.map((t) => trackRow(t)).join("") : emptyState("No tracks found.");
      } else if (state.searchMode === "playlists") {
        target.className = "grid";
        target.innerHTML = state.searchResults.length ? state.searchResults.map(playlistCard).join("") : emptyState("No playlists found.");
      } else {
        target.className = "list";
        target.innerHTML = state.searchResults.length ? state.searchResults.map(personRow).join("") : emptyState("No creators found.");
      }
      status.textContent = `${state.searchResults.length} result${state.searchResults.length === 1 ? "" : "s"}`;
    } catch (error) {
      if (requestId !== state.searchRequest) return;
      status.textContent = "Search failed.";
      target.innerHTML = emptyState(error.message);
    }
  }

  function setSearchMode(mode) {
    if (!["music", "playlists", "people"].includes(mode)) return;
    state.searchMode = mode;
    document.querySelectorAll("[data-search-mode]").forEach((button) => button.classList.toggle("active", button.dataset.searchMode === mode));
    runSearch();
  }

  async function renderLibrary() {
    $("page-library").innerHTML = `<div class="eyebrow">Your collection</div><div class="row-between"><h1 class="page-title">Library</h1><button class="primary-button" data-action="create-playlist">${icon("plus", 15)} Create</button></div><div class="pill-row"><button class="pill" data-library-scope="mine">Playlists</button><button class="pill" data-library-scope="discover">Discover</button><button class="pill" data-library-scope="following">Following</button><button class="pill" data-library-scope="collaborating">Collaborating</button><button class="pill" data-library-scope="liked">Liked songs</button><button class="pill" data-library-scope="history">History</button></div><p id="libraryStatus" class="search-status"></p><div id="libraryItems" class="grid"><div class="skeleton"></div></div>`;
    await showLibraryScope(state.libraryScope || "mine");
  }

  async function showLibraryScope(scope) {
    const allowed = ["mine", "discover", "following", "collaborating", "liked", "history"];
    if (!allowed.includes(scope)) return;
    state.libraryScope = scope;
    document.querySelectorAll("[data-library-scope]").forEach((button) => button.classList.toggle("active", button.dataset.libraryScope === scope));
    const target = $("libraryItems");
    const status = $("libraryStatus");
    if (!target) return;
    const isTrackList = scope === "liked" || scope === "history";
    target.className = isTrackList ? "list" : "grid";
    target.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`;
    status.textContent = "Loading…";
    try {
      let items = [];
      if (scope === "liked") {
        await loadLiked();
        items = state.liked;
        target.innerHTML = items.length ? items.map((t) => trackRow(t)).join("") : emptyState("Songs you like will appear here.");
      } else if (scope === "history") {
        const data = await api("/api/listening/history?limit=50");
        state.history = data.results || [];
        items = state.history;
        target.innerHTML = items.length ? items.map((t) => trackRow(t)).join("") : emptyState("Your listening history is empty.");
      } else {
        const data = await api(`/api/playlists?scope=${encodeURIComponent(scope)}&limit=50`);
        items = data.results || [];
        if (scope === "mine") state.playlists = items;
        target.innerHTML = items.length ? items.map(playlistCard).join("") : emptyState(scope === "discover" ? "Public playlists will appear here." : "Nothing here yet.");
      }
      status.textContent = `${items.length} ${isTrackList ? "tracks" : "playlists"}`;
    } catch (error) {
      target.innerHTML = emptyState(error.message);
      status.textContent = "Unable to load this section.";
    }
  }

  async function loadPlaylist(id) {
    const data = await api(`/api/playlists/${encodeURIComponent(id)}`);
    state.activePlaylist = data.playlist;
    setPage("playlist");
  }

  function renderPlaylist() {
    const playlist = state.activePlaylist;
    if (!playlist) {
      $("page-playlist").innerHTML = emptyState("Playlist not found.");
      return;
    }
    const tracks = playlist.tracks || [];
    const canEdit = ["owner", "editor"].includes(playlist.role);
    const canAdd = ["owner", "editor", "contributor"].includes(playlist.role);
    const isOwner = playlist.role === "owner";
    const groupActions = state.selectedGroup ? `<button class="secondary-button" data-action="group-play-playlist">${icon("users", 15)} Play in group</button><button class="secondary-button" data-action="group-queue-playlist">Queue in group</button>` : "";
    $("page-playlist").innerHTML = `<button class="text-button" data-page="library">← Back to library</button>
      <div class="detail-head">${image(playlist.cover_url, "detail-cover")}<div class="grow"><span class="eyebrow">${esc(playlist.visibility)} playlist</span><div class="detail-name">${esc(playlist.name)}</div><div class="track-sub">${tracks.length} songs · by @${esc(playlist.owner?.handle || "listener")}</div><div class="track-sub">${Number(playlist.like_count || 0)} likes · ${Number(playlist.follower_count || 0)} followers</div></div></div>
      <p class="muted small">${esc(playlist.description || "")}</p>
      <div class="detail-actions"><button class="primary-button" data-action="play-playlist" ${tracks.length ? "" : "disabled"}>${icon("play", 15)} Play personally</button><button class="secondary-button" data-action="like-playlist">${icon(playlist.liked ? "heartFill" : "heart", 15)} ${playlist.liked ? "Liked" : "Like"}</button>${!isOwner ? `<button class="secondary-button" data-action="playlist-follow" data-id="${esc(playlist.id)}">${playlist.followed ? "Following" : "Follow"}</button>` : ""}${canAdd ? `<button class="secondary-button" data-action="add-from-search">${icon("plus", 15)} Add songs</button>` : ""}${groupActions}${canEdit ? `<button class="secondary-button" data-action="edit-playlist">Edit</button>` : ""}${isOwner ? `<button class="secondary-button" data-action="invite-collaborator">Invite</button><button class="danger-button" data-action="delete-playlist">${icon("trash", 14)} Delete</button>` : `<button class="secondary-button" data-action="report-playlist">${icon("flag", 14)} Report</button>`}</div>
      ${isOwner ? `<div class="section-head"><h2>Collaborators</h2><span class="muted small">${(playlist.collaborators || []).length}</span></div><div class="list">${(playlist.collaborators || []).map((c) => `<div class="setting-row"><div class="setting-copy"><strong>${esc(c.display_name || c.handle || c.user_id)}</strong><small>@${esc(c.handle || "listener")} · ${esc(c.role)}</small></div><div class="track-actions"><button class="track-action" data-action="change-collaborator" data-id="${esc(c.user_id)}">${icon("settings", 15)}</button><button class="track-action" data-action="remove-collaborator" data-id="${esc(c.user_id)}">${icon("close", 15)}</button></div></div>`).join("") || emptyState("No collaborators yet.")}</div>` : ""}
      <div class="section-head"><h2>Tracks</h2><span class="muted small">${tracks.length} songs</span></div><div class="list">${tracks.length ? tracks.map((t, index) => trackRow(t, { playlist: true, canEdit, index })).join("") : emptyState("This playlist is empty.")}</div>`;
  }

  async function reloadActivePlaylist() {
    if (!state.activePlaylist?.id) return;
    const data = await api(`/api/playlists/${encodeURIComponent(state.activePlaylist.id)}`);
    state.activePlaylist = data.playlist;
    renderPlaylist();
  }

  async function openPerson(handle) {
    const data = await api(`/api/people/${encodeURIComponent(handle)}`);
    state.activePerson = data.profile;
    setPage("person");
  }

  function renderPerson() {
    const person = state.activePerson;
    if (!person) {
      $("page-person").innerHTML = emptyState("Profile not found.");
      return;
    }
    const self = Number(person.user_id) === Number(state.profile?.user_id);
    const followed = person.follow_state || "";
    $("page-person").innerHTML = `<button class="text-button" data-page="search">← Back to search</button><div class="profile-head">${image(person.avatar_url, "profile-big-avatar")}<h1>${esc(person.display_name || "Listener")}</h1><p class="muted small">@${esc(person.handle || "listener")}</p><p class="profile-bio">${esc(person.bio || "No bio added yet.")}</p><div class="stat-row"><div class="stat"><strong>${Number(person.followers || 0)}</strong><span>Followers</span></div><div class="stat"><strong>${Number(person.following || 0)}</strong><span>Following</span></div></div>${self ? "" : `<div class="detail-actions"><button class="primary-button" data-action="follow-person" data-id="${esc(person.user_id)}" data-state="${esc(followed)}" data-visibility="${esc(person.visibility || "public")}">${followed === "accepted" ? "Following" : followed === "pending" ? "Requested" : "Follow"}</button><button class="secondary-button" data-action="report-person" data-id="${esc(person.user_id)}">Report</button></div>`}</div><div class="section-head"><h2>Creator profile</h2></div><div class="empty">Public profile details and follow status are shown above.</div>`;
  }

  async function renderGroups() {
    const page = $("page-groups");
    page.innerHTML = `<div class="eyebrow">Telegram voice chats</div><h1 class="page-title">Group player</h1><p class="muted small">Choose a saved group or connect a supergroup by its ID. Group playback stays separate from your personal player.</p><div class="section-head"><h2>Your groups</h2><button data-action="refresh-groups">Refresh</button></div><div id="savedGroups" class="list"><div class="skeleton"></div><div class="skeleton"></div></div><div class="section-head"><h2>Connect another group</h2></div><div class="search-box"><input id="groupIdInput" inputmode="numeric" placeholder="Supergroup ID · -100…"><button class="primary-button" data-action="connect-group">Connect</button></div><div id="groupStatusPanel" class="section"></div>`;
    await loadGroups();
  }

  async function loadGroups(offset = 0) {
    const target = $("savedGroups");
    if (!target) return;

    const append = Number(offset) > 0;
    if (!append) {
      state.groups = [];
      state.groupOffset = null;
      target.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`;
    }

    try {
      const data = await api(`/api/groups?limit=20&offset=${Math.max(0, Number(offset) || 0)}`);
      const nextItems = Array.isArray(data.groups) ? data.groups : [];
      state.groups = append ? [...state.groups, ...nextItems] : nextItems;
      state.groupOffset = data.next_offset ?? null;

      const groupMarkup = state.groups.map((group) => `
        <article class="group-row">
          <div class="group-avatar">${icon("users", 18)}</div>
          <div class="track-copy">
            <div class="track-title">${esc(group.title || "Telegram group")}</div>
            <div class="track-sub">${group.active ? (group.playing ? "Playing" : "Paused") : "Idle"} · ${Number(group.queue_count || 0)} queued</div>
          </div>
          <button class="secondary-button" data-action="select-group" data-id="${esc(group.chat_id)}">${Number(state.selectedGroup?.chat_id) === Number(group.chat_id) ? "Selected" : "Open"}</button>
        </article>
      `).join("");

      const moreMarkup = state.groupOffset !== null
        ? `<div class="load-more-wrap"><button class="secondary-button" data-action="load-more-groups">Load more groups</button></div>`
        : "";

      target.innerHTML = groupMarkup
        ? `${groupMarkup}${moreMarkup}`
        : emptyState("No saved groups were found. Connect a supergroup below.");

      if (state.selectedGroup) await refreshGroupStatus();
    } catch (error) {
      if (!append) target.innerHTML = emptyState(error.message);
      else showToast(error.message);
    }
  }

  async function loadMoreGroups() {
    if (state.groupOffset === null || state.groupOffset === undefined) return;
    await loadGroups(state.groupOffset);
  }

  async function connectGroup() {
    const raw = $("groupIdInput")?.value.trim() || "";
    if (!/^-100\d{6,13}$/.test(raw)) throw new Error("Enter a valid Telegram supergroup ID starting with -100.");
    const chatId = Number(raw);
    if (!Number.isSafeInteger(chatId)) throw new Error("This group ID is not supported.");
    state.selectedGroup = { chat_id: chatId };
    state.groupStatus = null;
    await refreshGroupStatus();
    try { localStorage.setItem("taalune.selectedGroup", String(chatId)); } catch (_) {}
    await loadGroups();
    showToast("Group connected");
  }

  function disconnectGroup() {
    state.selectedGroup = null;
    state.groupStatus = null;
    try { localStorage.removeItem("taalune.selectedGroup"); } catch (_) {}
    if (state.page === "groups") renderGroups();
    showToast("Group disconnected");
  }

  async function selectGroup(chatId) {
    const id = Number(chatId);
    if (!Number.isSafeInteger(id) || id >= 0) throw new Error("Invalid Telegram supergroup ID.");
    state.selectedGroup = { chat_id: id };
    try { localStorage.setItem("taalune.selectedGroup", String(id)); } catch (_) {}
    await refreshGroupStatus();
    renderGroups();
  }

  async function refreshGroupStatus() {
    if (!state.selectedGroup) return null;
    const chatId = state.selectedGroup.chat_id;
    const data = await api(`/api/groups/${encodeURIComponent(chatId)}/status`);
    if (!state.selectedGroup || Number(state.selectedGroup.chat_id) !== Number(chatId)) return null;
    state.groupStatus = data.group;
    renderGroupStatus(data.group);
    return data.group;
  }

  function renderGroupStatus(group) {
    const panel = $("groupStatusPanel");
    if (!panel) return;
    const current = group.current;
    const pending = group.queue || [];
    panel.innerHTML = `<section class="group-panel">
      <div class="row-between"><div><span class="eyebrow">Connected group</span><h2>${esc(group.title || "Telegram group")}</h2><p class="track-sub">${esc(group.chat_id)} · Assistant ${esc(group.assistant_id || "—")}</p></div><span class="status-label">${group.can_control ? "Control access" : "View only"}</span></div>
      <div class="section-head"><h2>Now playing</h2><span class="muted small">${group.active ? (group.playing ? "Playing" : "Paused") : "Idle"}</span></div>
      ${current ? `<article class="track-row">${image(current.thumbnail, "track-cover")}<div class="track-copy"><div class="track-title">${esc(current.title)}</div><div class="track-sub">${esc(current.artist || "Unknown artist")} · ${formatTime(current.duration_sec)}</div></div></article>` : emptyState("Nothing is playing in this group.")}
      ${group.can_control ? `<div class="detail-actions">${group.active ? `<button class="secondary-button" data-action="group-control" data-command="${group.playing ? "pause" : "resume"}">${icon(group.playing ? "pause" : "play", 15)} ${group.playing ? "Pause" : "Resume"}</button><button class="secondary-button" data-action="group-control" data-command="skip">${icon("next", 15)} Next</button><button class="danger-button" data-action="group-control" data-command="stop">Stop</button><button class="secondary-button" data-action="group-seek">Seek</button>` : `<span class="muted small">Play or queue a song from Search, or open a playlist.</span>`}<button class="secondary-button" data-action="group-shuffle" ${pending.length < 2 ? "disabled" : ""}>${icon("shuffle", 14)} Shuffle queue</button><button class="secondary-button" data-action="refresh-group">Refresh</button><button class="text-button" data-action="disconnect-group">Disconnect</button></div>
      <div class="group-advanced-controls"><label class="inline-control">Repeat <select id="groupLoopCount"><option value="0">Off</option><option value="1">1×</option><option value="2">2×</option><option value="3">3×</option><option value="5">5×</option><option value="10">10×</option></select></label><button class="secondary-button" data-action="group-loop">Apply repeat</button><label class="inline-control">Volume <input id="groupVolume" type="range" min="0" max="200" value="100"></label><button class="secondary-button" data-action="group-volume">Apply volume</button></div>` : `<p class="muted small">You can view this group. Group admins or authorized users can control playback.</p><button class="secondary-button" data-action="refresh-group">Refresh</button>`}
      </section>
      <div class="section-head"><h2>Up next</h2><span class="muted small">${Number(group.queue_count || 0)} songs</span></div>
      <div class="list">${pending.map((track, index) => `<article class="track-row">${image(track.thumbnail, "track-cover")}<div class="track-copy"><div class="track-title">${esc(track.title)}</div><div class="track-sub">${esc(track.artist || "Unknown artist")} · ${formatTime(track.duration_sec)}</div></div>${group.can_control ? `<div class="track-actions"><button class="track-action" data-action="group-queue-up" data-index="${index}" aria-label="Move up" ${index === 0 ? "disabled" : ""}>↑</button><button class="track-action" data-action="group-queue-down" data-index="${index}" aria-label="Move down" ${index === pending.length - 1 ? "disabled" : ""}>↓</button><button class="track-action" data-action="group-queue-remove" data-id="${esc(track.id)}" aria-label="Remove from group queue">${icon("close", 15)}</button></div>` : ""}</article>`).join("") || emptyState("The group queue is empty.")}</div>`;
  }

  async function groupControl(action, payload = {}) {
    if (!state.selectedGroup) throw new Error("Connect a group first.");
    if (state.groupBusy) return;
    state.groupBusy = true;
    try {
      const chatId = state.selectedGroup.chat_id;
      const data = await api(`/api/groups/${encodeURIComponent(chatId)}/control`, { method: "POST", body: JSON.stringify({ action, ...payload }) });
      if (data.group) {
        state.groupStatus = data.group;
        renderGroupStatus(data.group);
      } else await refreshGroupStatus();
      showToast(data.status === "queued" ? "Added to group queue" : data.status === "playing" ? "Group playback started" : "Group playback updated");
      return data;
    } finally {
      state.groupBusy = false;
    }
  }

  async function shuffleGroupQueue() {
    if (!state.selectedGroup) throw new Error("Connect a group first.");
    const chatId = state.selectedGroup.chat_id;
    const data = await api(`/api/groups/${encodeURIComponent(chatId)}/shuffle`, { method: "POST" });
    state.groupStatus = data.group;
    renderGroupStatus(data.group);
    showToast("Group queue shuffled");
  }

  async function seekGroupTrack() {
    if (!state.selectedGroup || !state.groupStatus?.current) throw new Error("Nothing is playing in this group.");
    const duration = Number(state.groupStatus.current.duration_sec) || 0;
    const promptValue = prompt(`Seek position in seconds${duration ? ` (1–${Math.max(1, duration - 2)})` : ""}`, "30");
    if (promptValue === null) return;
    const position = Number(promptValue);
    if (!Number.isInteger(position) || position < 1 || (duration && position >= duration - 1)) throw new Error("Enter a valid seek position before the end of the track.");
    const chatId = state.selectedGroup.chat_id;
    const data = await api(`/api/groups/${encodeURIComponent(chatId)}/seek`, { method: "POST", body: JSON.stringify({ position_sec: position }) });
    state.groupStatus = data.group;
    renderGroupStatus(data.group);
    showToast(`Group track moved to ${formatTime(position)}`);
  }

  async function setGroupLoop() {
    if (!state.selectedGroup) throw new Error("Connect a group first.");
    const count = Number($("groupLoopCount")?.value || 0);
    const data = await api(`/api/groups/${encodeURIComponent(state.selectedGroup.chat_id)}/loop`, { method: "PUT", body: JSON.stringify({ count }) });
    state.groupStatus = data.group;
    renderGroupStatus(data.group);
    showToast(count ? `Group repeat set to ${count}` : "Group repeat disabled");
  }

  async function setGroupVolume() {
    if (!state.selectedGroup) throw new Error("Connect a group first.");
    const volume = Number($("groupVolume")?.value || 100);
    const data = await api(`/api/groups/${encodeURIComponent(state.selectedGroup.chat_id)}/volume`, { method: "PUT", body: JSON.stringify({ volume }) });
    state.groupStatus = data.group;
    renderGroupStatus(data.group);
    showToast(`Group volume set to ${volume}%`);
  }

  async function reorderGroupQueue(index, direction) {
    const group = state.groupStatus;
    const queue = group?.queue || [];
    const source = Number(index);
    const destination = source + Number(direction);
    if (!state.selectedGroup || !Number.isInteger(source) || destination < 0 || destination >= queue.length) return;
    const reordered = queue.slice();
    [reordered[source], reordered[destination]] = [reordered[destination], reordered[source]];
    const data = await api(`/api/groups/${encodeURIComponent(state.selectedGroup.chat_id)}/queue/order`, {
      method: "PUT",
      body: JSON.stringify({ track_ids: reordered.map((track) => String(track.id)) })
    });
    state.groupStatus = data.group;
    renderGroupStatus(data.group);
  }

  async function removeGroupQueueTrack(trackId) {
    if (!state.selectedGroup) return;
    const data = await api(`/api/groups/${encodeURIComponent(state.selectedGroup.chat_id)}/queue/${encodeURIComponent(trackId)}`, { method: "DELETE" });
    state.groupStatus = data.group;
    renderGroupStatus(data.group);
    showToast("Removed from group queue");
  }

  async function renderProfile() {
    const page = $("page-profile");
    if (!state.profile) {
      page.innerHTML = `<div class="loading-state"><span class="spinner"></span>Loading profile…</div>`;
      try { await loadProfile(); } catch (error) { page.innerHTML = emptyState(error.message); return; }
    }
    const p = state.profile;
    page.innerHTML = `<div class="eyebrow">Your account</div><div class="profile-head">${image(p.avatar_url, "profile-big-avatar")}<h1>${esc(p.display_name || "Listener")}</h1><p class="muted small">@${esc(p.handle || "listener")}</p><p class="profile-bio">${esc(p.bio || "No bio added yet.")}</p><div class="stat-row"><div class="stat"><strong>${Number(p.followers || 0)}</strong><span>Followers</span></div><div class="stat"><strong>${Number(p.following || 0)}</strong><span>Following</span></div></div><div class="detail-actions"><button class="primary-button" data-action="edit-profile">Edit profile</button><button class="secondary-button" data-page="settings">Settings & privacy</button><button class="secondary-button" data-page="admin">Admin</button></div></div><div class="section-head"><h2>Your public playlists</h2><button data-page="library">Library</button></div><div id="profilePlaylists" class="grid"><div class="skeleton"></div></div>`;
    try {
      const data = await api("/api/playlists?scope=mine&limit=50");
      const publicItems = (data.results || []).filter((item) => item.visibility === "public");
      $("profilePlaylists").innerHTML = publicItems.length ? publicItems.map(playlistCard).join("") : emptyState("No public playlists yet.");
    } catch (error) { $("profilePlaylists").innerHTML = emptyState(error.message); }
  }

  async function renderNotifications() {
    const page = $("page-notifications");
    page.innerHTML = `<div class="eyebrow">Your activity</div><h1 class="page-title">Notifications</h1><div id="notificationItems" class="list"><div class="skeleton"></div><div class="skeleton"></div></div>`;
    try {
      const data = await api("/api/notifications?limit=40");
      state.notifications = data.results || [];
      $("notificationDot").hidden = !(Number(data.unread_count || 0) > 0);
      $("notificationItems").innerHTML = state.notifications.length ? state.notifications.map(renderNotification).join("") : emptyState("You are all caught up.");
    } catch (error) { $("notificationItems").innerHTML = emptyState(error.message); }
  }

  function renderNotification(item) {
    const payload = item.payload || {};
    const actor = esc(item.actor?.display_name || "Someone");
    const messages = {
      collaboration_invitation: `${actor} invited you to collaborate on <strong>${esc(payload.playlist_name || "a playlist")}</strong>.`,
      follow_request: `${actor} wants to follow you.`,
      new_follower: `${actor} started following you.`,
      playlist_followed: `${actor} followed your playlist <strong>${esc(payload.playlist_name || "")}</strong>.`,
      follow_accepted: `${actor} accepted your follow request.`,
      collaboration_role_changed: `Your role on <strong>${esc(payload.playlist_name || "a playlist")}</strong> is now ${esc(payload.role || "updated")}.`,
      collaboration_removed: `You were removed from <strong>${esc(payload.playlist_name || "a playlist")}</strong>.`,
      collaboration_accepted: `${actor} accepted your collaboration invitation.`,
      collaboration_rejected: `${actor} declined your collaboration invitation.`
    };
    const actions = item.type === "collaboration_invitation" ? `<button class="primary-button" data-action="respond-invitation" data-id="${esc(payload.invitation_id)}" data-choice="accept">Accept</button><button class="secondary-button" data-action="respond-invitation" data-id="${esc(payload.invitation_id)}" data-choice="reject">Decline</button>` : item.type === "follow_request" ? `<button class="primary-button" data-action="respond-follow" data-id="${esc(payload.follower_id || payload.user_id)}" data-choice="accept">Accept</button><button class="secondary-button" data-action="respond-follow" data-id="${esc(payload.follower_id || payload.user_id)}" data-choice="reject">Decline</button>` : "";
    return `<article class="notification ${item.read ? "" : "unread"}"><div class="notification-icon">${icon(item.type?.includes("collaboration") ? "users" : "bell", 17)}</div><div class="track-copy"><p>${messages[item.type] || "You have an update."}</p><div class="track-sub">${esc(item.created_at || "")}</div>${actions ? `<div class="notification-actions">${actions}</div>` : ""}</div>${item.read ? "" : `<button class="track-action" data-action="read-notification" data-id="${esc(item.id)}" aria-label="Mark read">${icon("check", 16)}</button>`}</article>`;
  }

  async function renderSettings() {
    const page = $("page-settings");
    page.innerHTML = `<div class="eyebrow">Preferences and data</div><h1 class="page-title">Settings & privacy</h1><div class="section-head"><h2>Preferences</h2></div><div id="settingsPanel" class="list"><div class="skeleton"></div></div><div class="section-head"><h2>Privacy</h2></div><div id="privacyPanel" class="list"><div class="skeleton"></div></div><div class="section-head"><h2>Account data</h2></div><div class="detail-actions"><button class="secondary-button" data-action="export-account">Export my data</button><button class="danger-button" data-action="delete-account">Request account deletion</button></div><div class="section-head"><h2>Safety</h2></div><div class="detail-actions"><button class="secondary-button" data-action="manage-blocks">Blocked users</button><button class="secondary-button" data-action="my-reports">My reports</button></div>`;
    try {
      const [settings, privacy] = await Promise.all([api("/api/settings"), api("/api/account/privacy")]);
      state.settings = settings.settings || {};
      state.privacy = privacy.privacy || {};
      applyTheme(state.settings.theme || "dark");
      $("settingsPanel").innerHTML = `<div class="setting-row"><div class="setting-copy"><strong>Theme</strong><small>Display preference</small></div><select id="settingTheme"><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></div><div class="setting-row"><div class="setting-copy"><strong>Personalized recommendations</strong><small>Use listening activity for your mix</small></div><button class="switch" id="settingRecommendations" role="switch" aria-checked="${state.settings.personalized_recommendations !== false}" data-setting="personalized_recommendations"></button></div><button class="primary-button" data-action="save-settings">Save preferences</button>`;
      $("settingTheme").value = state.settings.theme || "dark";
      $("privacyPanel").innerHTML = `<div class="setting-row"><div class="setting-copy"><strong>Profile visibility</strong><small>Public profiles can be discovered by other listeners</small></div><select id="privacyVisibility"><option value="public">Public</option><option value="private">Private</option></select></div><div class="setting-row"><div class="setting-copy"><strong>Discoverable</strong><small>Allow your profile to appear in people search</small></div><button class="switch" id="privacyDiscoverable" role="switch" aria-checked="${state.privacy.discoverable !== false}" data-privacy="discoverable"></button></div><button class="primary-button" data-action="save-privacy">Save privacy</button>`;
      $("privacyVisibility").value = state.privacy.visibility || "public";
    } catch (error) {
      $("settingsPanel").innerHTML = emptyState(error.message);
      $("privacyPanel").innerHTML = emptyState("Privacy settings could not be loaded.");
    }
  }

  async function renderAdmin() {
    const page = $("page-admin");
    page.innerHTML = `<div class="eyebrow">Restricted area</div><h1 class="page-title">Administration</h1><div id="adminOverview" class="grid"><div class="skeleton"></div></div><div class="section-head"><h2>Users</h2></div><label class="search-box"><input id="adminUserSearch" type="search" placeholder="Search users by handle or ID"><button class="secondary-button" data-action="admin-search">Search</button></label><div id="adminUsers" class="list"></div><div class="section-head"><h2>Audit log</h2><button data-action="admin-audit">Refresh</button></div><div id="adminAudit" class="list"></div><div class="section-head"><h2>Moderation</h2></div><div class="detail-actions"><button class="secondary-button" data-action="admin-reports">Reports</button><button class="secondary-button" data-action="admin-deletions">Deletion requests</button></div><div id="adminModeration" class="list"></div>`;
    try {
      const data = await api("/api/admin/overview");
      const stats = data.stats || {};
      $("adminOverview").innerHTML = Object.entries(stats).map(([key, value]) => `<div class="stat-card"><strong>${Number(value || 0).toLocaleString()}</strong><span>${esc(key.replaceAll("_", " "))}</span></div>`).join("");
      await loadAdminAudit();
    } catch (error) { $("adminOverview").innerHTML = emptyState(error.message); }
  }

  async function loadAdminAudit() {
    const target = $("adminAudit");
    if (!target) return;
    try {
      const data = await api("/api/admin/audit?limit=40");
      target.innerHTML = (data.results || []).map((item) => `<article class="setting-row"><div class="setting-copy"><strong>${esc(item.action || "Event")}</strong><small>${esc(item.reason || "No note")} · actor ${esc(item.actor_id ?? "—")} · target ${esc(item.target_user_id ?? "—")}</small></div><span class="tiny muted">${esc(item.created_at || "")}</span></article>`).join("") || emptyState("No audit events.");
    } catch (error) { target.innerHTML = emptyState(error.message); }
  }

  async function adminSearchUsers() {
    const q = $("adminUserSearch")?.value.trim() || "";
    const data = await api(`/api/admin/users?q=${encodeURIComponent(q)}&limit=30`);
    $("adminUsers").innerHTML = (data.results || []).map((user) => `<article class="person-row">${image(user.avatar_url, "person-avatar")}<div class="track-copy"><div class="track-title">${esc(user.display_name || "Listener")}</div><div class="track-sub">@${esc(user.handle || "listener")} · ${esc(user.user_id)} ${user.banned ? "· Banned" : ""}</div></div><button class="secondary-button" data-action="admin-ban" data-id="${esc(user.user_id)}" data-banned="${user.banned}">${user.banned ? "Unban" : "Ban"}</button></article>`).join("") || emptyState("No matching users.");
  }

  async function adminLoadModeration(kind) {
    const target = $("adminModeration");
    target.innerHTML = `<div class="skeleton"></div>`;
    const path = kind === "reports" ? "/api/admin/moderation/reports?status=open&limit=50" : "/api/admin/moderation/deletion-requests?status=pending&limit=50";
    const data = await api(path);
    target.innerHTML = (data.results || []).map((item) => kind === "reports" ? `<article class="notification"><div class="track-copy"><strong>${esc(item.target_type)} · ${esc(item.reason)}</strong><p>${esc(item.details || "No details")}</p><div class="track-sub">Report ${esc(item.id)} · target ${esc(item.target?.id || "")}</div></div><button class="secondary-button" data-action="review-report" data-id="${esc(item.id)}">Review</button></article>` : `<article class="notification"><div class="track-copy"><strong>${esc(item.user?.display_name || "Deleted user request")}</strong><div class="track-sub">${esc(item.request_id)} · ${esc(item.reason || "No reason")}</div></div><button class="secondary-button" data-action="review-deletion" data-id="${esc(item.request_id)}">Review</button></article>`).join("") || emptyState("Nothing to review.");
  }

  function renderModalField(label, id, value = "", type = "text", attrs = "") {
    return `<label class="field"><span>${esc(label)}</span><input id="${esc(id)}" type="${esc(type)}" value="${esc(value)}" ${attrs}></label>`;
  }

  function createPlaylistModal() {
    openModal("Create playlist", `<form id="createPlaylistForm" class="form-grid"><label class="field full"><span>Playlist name</span><input id="newPlaylistName" maxlength="60" required placeholder="Give your playlist a name"></label><label class="field full"><span>Description</span><textarea id="newPlaylistDescription" maxlength="300" rows="3" placeholder="Optional description"></textarea></label><label class="field"><span>Visibility</span><select id="newPlaylistVisibility"><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></label><label class="field"><span>Cover image</span><input id="newPlaylistCover" type="file" accept="image/jpeg,image/png,image/webp"></label><div class="field full"><div id="newPlaylistCoverStatus" class="track-sub">Choose a JPG, PNG or WebP image (maximum 5 MB).</div></div></form>`, `<button class="secondary-button" data-action="close-modal">Cancel</button><button class="primary-button" data-action="submit-create-playlist">Create playlist</button>`);
  }

  async function createPlaylist() {
    const name = $("newPlaylistName")?.value.trim() || "";
    if (!name) throw new Error("Enter a playlist name.");
    const cover = await uploadSelectedCover("newPlaylistCover");
    const payload = {
      name,
      description: $("newPlaylistDescription")?.value.trim() || "",
      visibility: $("newPlaylistVisibility")?.value || "private",
      cover_url: cover?.url || null
    };
    const data = await api("/api/playlists", { method: "POST", body: JSON.stringify(payload) });
    state.activePlaylist = data.playlist;
    state.homeBusy = false;
    closeModal();
    showToast("Playlist created");
    setPage("playlist");
  }

  function editPlaylistModal() {
    const p = state.activePlaylist;
    if (!p) return;
    openModal("Edit playlist", `<form id="editPlaylistForm" class="form-grid"><label class="field full"><span>Name</span><input id="editPlaylistName" maxlength="60" required value="${esc(p.name)}"></label><label class="field full"><span>Description</span><textarea id="editPlaylistDescription" maxlength="300" rows="3">${esc(p.description || "")}</textarea></label><label class="field"><span>Visibility</span><select id="editPlaylistVisibility"><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></label><label class="field"><span>New cover (optional)</span><input id="editPlaylistCover" type="file" accept="image/jpeg,image/png,image/webp"></label></form>`, `<button class="secondary-button" data-action="close-modal">Cancel</button><button class="primary-button" data-action="submit-edit-playlist">Save changes</button>`);
    $("editPlaylistVisibility").value = p.visibility || "private";
  }

  async function editPlaylist() {
    const p = state.activePlaylist;
    const cover = await uploadSelectedCover("editPlaylistCover");
    const payload = {
      name: $("editPlaylistName").value.trim(),
      description: $("editPlaylistDescription").value.trim(),
      visibility: $("editPlaylistVisibility").value,
      version: Number(p.version || 1)
    };
    if (cover?.url) payload.cover_url = cover.url;
    const data = await api(`/api/playlists/${encodeURIComponent(p.id)}`, { method: "PATCH", body: JSON.stringify(payload) });
    state.activePlaylist = data.playlist;
    closeModal();
    renderPlaylist();
    showToast("Playlist updated");
  }

  function editProfileModal() {
    const p = state.profile || {};
    openModal("Edit profile", `<form id="editProfileForm" class="form-grid"><label class="field"><span>Display name</span><input id="profileDisplayName" maxlength="48" required value="${esc(p.display_name || "")}"></label><label class="field"><span>Handle</span><input id="profileHandle" maxlength="24" minlength="3" value="${esc(p.handle || "")}"></label><label class="field full"><span>Bio</span><textarea id="profileBio" maxlength="160" rows="3">${esc(p.bio || "")}</textarea></label><label class="field full"><span>Avatar image (optional)</span><input id="profileAvatar" type="file" accept="image/jpeg,image/png,image/webp"></label></form>`, `<button class="secondary-button" data-action="close-modal">Cancel</button><button class="primary-button" data-action="submit-profile">Save profile</button>`);
  }

  async function saveProfile() {
    const cover = await uploadSelectedCover("profileAvatar");
    const payload = {
      display_name: $("profileDisplayName").value.trim(),
      handle: $("profileHandle").value.trim().toLowerCase(),
      bio: $("profileBio").value.trim()
    };
    if (cover?.url) payload.avatar_url = cover.url;
    const data = await api("/api/profile", { method: "PATCH", body: JSON.stringify(payload) });
    state.profile = data.profile;
    setAvatar();
    closeModal();
    renderProfile();
    showToast("Profile updated");
  }

  async function uploadSelectedCover(inputId) {
    const file = $(inputId)?.files?.[0];
    if (!file) return null;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Use a valid JPG, PNG or WebP image.");
    if (file.size <= 0 || file.size > 5 * 1024 * 1024) throw new Error("Image must be 5 MB or smaller.");
    const form = new FormData();
    form.append("file", file, file.name);
    const data = await api("/api/upload/cover", { method: "POST", body: form });
    return { url: data.url, filename: data.filename };
  }

  async function loadPersonalPlaylists() {
    const data = await api("/api/playlists?scope=mine&limit=50");
    state.playlists = data.results || [];
    return state.playlists;
  }

  async function openTrackMenu(track) {
    state.modalTrack = track;
    let playlistOptions = [];
    try { playlistOptions = await loadPersonalPlaylists(); } catch (_) {}
    const preferredPlaylistId = state.modalTargetPlaylistId || state.activePlaylist?.id || "";
    const options = playlistOptions.map((p) => `<option value="${esc(p.id)}" ${String(p.id) === String(preferredPlaylistId) ? "selected" : ""}>${esc(p.name)}</option>`).join("");
    openModal(track.title || "Song actions", `<div class="track-row">${image(track.thumbnail, "track-cover")}<div class="track-copy"><strong class="track-title">${esc(track.title)}</strong><small class="track-sub">${esc(track.artist || "Unknown artist")}</small></div></div><div class="stack" style="margin-top:14px"><button class="secondary-button full-width" data-action="modal-play-track">${icon("play", 15)} Play personally</button><button class="secondary-button full-width" data-action="modal-like-track">${icon("heart", 15)} ${isLiked(track.id) ? "Remove from liked songs" : "Add to liked songs"}</button>${state.selectedGroup ? `<button class="secondary-button full-width" data-action="modal-group-play">${icon("users", 15)} Play in group</button><button class="secondary-button full-width" data-action="modal-group-queue">Queue in group</button>` : ""}<label class="field"><span>Add to playlist</span><select id="trackTargetPlaylist"><option value="">Choose a playlist</option>${options}</select></label><button class="secondary-button full-width" data-action="modal-add-playlist">Add to playlist</button><button class="text-button full-width" data-action="report-track">Report this track</button></div>`, `<button class="secondary-button" data-action="close-modal">Close</button>`);
  }

  async function addTrackToPlaylist(track, playlistId) {
    await api(`/api/playlists/${encodeURIComponent(playlistId)}/tracks`, { method: "POST", body: JSON.stringify(trackPayload(track)) });
    if (state.activePlaylist?.id === playlistId) await reloadActivePlaylist();
    showToast("Song added to playlist");
  }

  async function removePlaylistTrack(trackId) {
    const playlist = state.activePlaylist;
    if (!playlist || !confirm("Remove this song from the playlist?")) return;
    await api(`/api/playlists/${encodeURIComponent(playlist.id)}/tracks/${encodeURIComponent(trackId)}`, { method: "DELETE" });
    await reloadActivePlaylist();
    showToast("Song removed from playlist");
  }

  async function movePlaylistTrack(index, direction) {
    const playlist = state.activePlaylist;
    const tracks = playlist?.tracks || [];
    const source = Number(index);
    const destination = source + Number(direction);
    if (!playlist || !Number.isInteger(source) || source < 0 || destination < 0 || destination >= tracks.length) return;
    const reordered = tracks.slice();
    [reordered[source], reordered[destination]] = [reordered[destination], reordered[source]];
    const data = await api(`/api/playlists/${encodeURIComponent(playlist.id)}/tracks/order`, {
      method: "PUT",
      body: JSON.stringify({ track_ids: reordered.map((item) => String(item.id)), version: Number(playlist.version || 1) })
    });
    state.activePlaylist = data.playlist;
    renderPlaylist();
  }

  async function toggleTrackLike(track) {
    if (!track?.id) return;
    if (!state.likedLoaded) await loadLiked();
    const id = String(track.id);
    if (isLiked(id)) {
      await api(`/api/tracks/${encodeURIComponent(id)}/like`, { method: "DELETE" });
      state.liked = state.liked.filter((item) => String(item.id) !== id);
      showToast("Removed from Liked Songs");
    } else {
      await api(`/api/tracks/${encodeURIComponent(id)}/like`, { method: "POST", body: JSON.stringify(trackPayload(track)) });
      state.liked.unshift(trackPayload(track));
      showToast("Added to Liked Songs");
    }
    if (state.page === "library" && state.libraryScope === "liked") showLibraryScope("liked");
    if (state.page === "home") loadHome(true);
    if (state.page === "search") renderSearchResultsIfNeeded();
    updatePlayer();
  }

  function renderSearchResultsIfNeeded() {
    const target = $("searchResults");
    if (target && state.searchMode === "music") target.innerHTML = state.searchResults.map((t) => trackRow(t)).join("");
  }

  async function togglePlaylistFollow(id) {
    const playlist = findPlaylist(id);
    const followed = Boolean(playlist?.followed);
    await api(`/api/playlists/${encodeURIComponent(id)}/follow`, { method: followed ? "DELETE" : "POST" });
    if (playlist) playlist.followed = !followed;
    if (state.activePlaylist?.id === id) state.activePlaylist.followed = !followed;
    showToast(followed ? "Playlist unfollowed" : "Playlist followed");
    if (state.page === "playlist") renderPlaylist();
    else if (state.page === "library") showLibraryScope(state.libraryScope);
    else if (state.page === "home") loadHome(true);
  }

  function findPlaylist(id) {
    return [state.playlists, state.discover, state.fresh, state.activePlaylist ? [state.activePlaylist] : []].flat().find((p) => String(p.id) === String(id)) || null;
  }

  async function togglePlaylistLike() {
    const p = state.activePlaylist;
    if (!p) return;
    await api(`/api/playlists/${encodeURIComponent(p.id)}/like`, { method: p.liked ? "DELETE" : "POST" });
    p.liked = !p.liked;
    p.like_count = Math.max(0, Number(p.like_count || 0) + (p.liked ? 1 : -1));
    renderPlaylist();
  }

  async function followPerson(button) {
    const id = button.dataset.id;
    const previous = button.dataset.state || "";
    const visibility = button.dataset.visibility || state.activePerson?.visibility || "public";
    if (!id) return;
    if (previous === "accepted" || previous === "pending") {
      await api(`/api/people/${encodeURIComponent(id)}/follow`, { method: "DELETE" });
      button.dataset.state = "";
      button.textContent = "Follow";
      showToast(previous === "pending" ? "Follow request cancelled" : "Unfollowed");
    } else {
      const data = await api(`/api/people/${encodeURIComponent(id)}/follow`, { method: "POST" });
      const next = data.status || (visibility === "private" ? "pending" : "accepted");
      button.dataset.state = next;
      button.textContent = next === "pending" ? "Requested" : "Following";
      if (state.activePerson && Number(state.activePerson.user_id) === Number(id)) state.activePerson.follow_state = next;
      showToast(next === "pending" ? "Follow request sent" : "Following");
    }
  }

  async function respondFollow(button) {
    await api(`/api/people/${encodeURIComponent(button.dataset.id)}/follow-response`, { method: "POST", body: JSON.stringify({ action: button.dataset.choice }) });
    showToast("Follow request updated");
    renderNotifications();
  }

  async function respondInvitation(button) {
    await api(`/api/invitations/${encodeURIComponent(button.dataset.id)}/respond`, { method: "POST", body: JSON.stringify({ action: button.dataset.choice }) });
    showToast(button.dataset.choice === "accept" ? "Invitation accepted" : "Invitation declined");
    renderNotifications();
  }

  async function markNotificationRead(id) {
    await api(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
    const entry = state.notifications.find((item) => String(item.id) === String(id));
    if (entry) entry.read = true;
    const unread = state.notifications.some((item) => !item.read);
    $("notificationDot").hidden = !unread;
    renderNotifications();
  }

  async function sendInvitation() {
    if (!state.activePlaylist) throw new Error("Open a playlist first.");
    const userId = Number($("inviteUserId")?.value);
    const role = $("inviteRole")?.value || "editor";
    if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("Enter a valid Telegram user ID.");
    await api(`/api/playlists/${encodeURIComponent(state.activePlaylist.id)}/invitations`, { method: "POST", body: JSON.stringify({ user_id: userId, role }) });
    closeModal();
    showToast("Collaboration invitation sent");
  }

  async function changeCollaborator(id) {
    const role = prompt("Choose a role: editor, contributor or viewer", "editor");
    if (!role) return;
    if (!["editor", "contributor", "viewer"].includes(role)) throw new Error("Choose editor, contributor or viewer.");
    await api(`/api/playlists/${encodeURIComponent(state.activePlaylist.id)}/collaborators/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ role }) });
    await reloadActivePlaylist();
    showToast("Collaborator role updated");
  }

  async function removeCollaborator(id) {
    if (!confirm("Remove this collaborator from the playlist?")) return;
    await api(`/api/playlists/${encodeURIComponent(state.activePlaylist.id)}/collaborators/${encodeURIComponent(id)}`, { method: "DELETE" });
    await reloadActivePlaylist();
    showToast("Collaborator removed");
  }

  async function deletePlaylist() {
    const p = state.activePlaylist;
    if (!p || !confirm(`Delete “${p.name}”? This cannot be undone.`)) return;
    await api(`/api/playlists/${encodeURIComponent(p.id)}`, { method: "DELETE" });
    state.activePlaylist = null;
    closeModal();
    showToast("Playlist deleted");
    setPage("library");
  }

  async function reportContent(targetType, targetId) {
    const reason = prompt("Reason for report (spam, harassment, copyright, inappropriate content, or other):", "inappropriate content");
    if (!reason) return;
    const details = prompt("Additional details (optional):", "") || "";
    await api("/api/safety/reports", { method: "POST", body: JSON.stringify({ target_type: targetType, target_id: String(targetId), reason: reason.slice(0, 80), details: details.slice(0, 1000) }) });
    closeModal();
    showToast("Report submitted");
  }

  async function blockUser(id) {
    if (!confirm("Block this user?")) return;
    await api(`/api/safety/blocks/${encodeURIComponent(id)}`, { method: "POST" });
    showToast("User blocked");
  }

  async function manageBlocks() {
    const data = await api("/api/safety/blocks");
    state.blocks = data.results || [];
    openModal("Blocked users", state.blocks.length ? `<div class="list">${state.blocks.map((item) => `<article class="person-row">${image(item.avatar_url, "person-avatar")}<div class="track-copy"><strong class="track-title">${esc(item.display_name || "Listener")}</strong><small class="track-sub">@${esc(item.handle || "listener")} · ${esc(item.user_id)}</small></div><button class="secondary-button" data-action="unblock-user" data-id="${esc(item.user_id)}">Unblock</button></article>`).join("")}</div>` : emptyState("You have not blocked anyone."));
  }

  async function myReports() {
    const data = await api("/api/safety/reports/mine?limit=30");
    state.reports = data.results || [];
    openModal("My reports", state.reports.length ? `<div class="list">${state.reports.map((item) => `<article class="setting-row"><div class="setting-copy"><strong>${esc(item.target_type)} · ${esc(item.reason)}</strong><small>${esc(item.status)} · ${esc(item.created_at || "")}</small></div></article>`).join("")}</div>` : emptyState("You have not submitted any reports."));
  }

  async function saveSettings() {
    const payload = {
      theme: $("settingTheme").value,
      personalized_recommendations: $("settingRecommendations").getAttribute("aria-checked") === "true"
    };
    const data = await api("/api/settings", { method: "PATCH", body: JSON.stringify(payload) });
    state.settings = data.settings;
    applyTheme(state.settings.theme || payload.theme);
    showToast("Preferences saved");
  }

  function applyTheme(theme) {
    if (theme === "light") document.documentElement.dataset.theme = "light";
    else if (theme === "dark") document.documentElement.dataset.theme = "dark";
    else document.documentElement.removeAttribute("data-theme");
  }

  async function savePrivacy() {
    const payload = {
      visibility: $("privacyVisibility").value,
      discoverable: $("privacyDiscoverable").getAttribute("aria-checked") === "true",
    };
    const data = await api("/api/account/privacy", { method: "PATCH", body: JSON.stringify(payload) });
    state.privacy = data.privacy;
    if (state.profile) state.profile.visibility = payload.visibility;
    showToast("Privacy settings saved");
  }

  async function exportAccount() {
    const data = await api("/api/account/export");
    const blob = new Blob([JSON.stringify(data.export, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `taalune-account-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast("Your data export is ready");
  }

  async function requestDeletion() {
    openModal("Request account deletion", `<p>This submits a deletion request to the owner for processing. Your profile will be hidden while it is pending. This action cannot be undone after approval.</p><label class="field"><span>Reason (optional)</span><textarea id="deletionReason" maxlength="500" rows="3"></textarea></label><label class="field"><span>Type DELETE to confirm</span><input id="deletionConfirmation" autocomplete="off" placeholder="DELETE"></label>`, `<button class="secondary-button" data-action="close-modal">Cancel</button><button class="danger-button" data-action="confirm-deletion">Submit request</button>`);
  }

  async function confirmDeletion() {
    const confirmation = $("deletionConfirmation")?.value || "";
    const reason = $("deletionReason")?.value || "";
    const data = await api("/api/account/delete-request", { method: "POST", body: JSON.stringify({ confirmation, reason }) });
    closeModal();
    showToast(data.message || "Deletion request submitted");
  }

  function updatePlayer() {
    const track = state.currentTrack;
    const mini = $("miniPlayer");
    if (!track) {
      mini.hidden = true;
      $("miniTitle").textContent = "Nothing playing";
      $("miniArtist").textContent = "Choose a song";
      $("miniProgress").style.width = "0%";
      $("miniToggle").innerHTML = icon("play", 17);
      $("fullToggle").innerHTML = icon("play", 25);
      return;
    }
    mini.hidden = false;
    $("miniCover").src = track.thumbnail || "";
    $("fullCover").src = track.thumbnail || "";
    $("miniTitle").textContent = track.title || "Unknown title";
    $("miniArtist").textContent = track.artist || "Unknown artist";
    $("fullTitle").textContent = track.title || "Unknown title";
    $("fullArtist").textContent = track.artist || "Unknown artist";
    const playing = !audio.paused;
    $("miniToggle").innerHTML = icon(playing ? "pause" : "play", 17);
    $("fullToggle").innerHTML = icon(playing ? "pause" : "play", 25);
    const like = document.querySelector('[data-action="like-current"]');
    if (like) like.innerHTML = icon(isLiked(track.id) ? "heartFill" : "heart", 19);
    updateProgress();
  }

  function updateProgress() {
    if (!state.currentTrack) return;
    const duration = Number(audio.duration) || Number(state.currentTrack.duration_sec) || 0;
    const current = Number(audio.currentTime) || 0;
    const ratio = duration > 0 ? Math.min(1, Math.max(0, current / duration)) : 0;
    $("miniProgress").style.width = `${ratio * 100}%`;
    $("seek").value = String(Math.round(ratio * 1000));
    $("elapsed").textContent = formatTime(current);
    $("remaining").textContent = duration > 0 ? `-${formatTime(Math.max(0, duration - current))}` : "--:--";
    if (duration > 0 && current >= Math.min(30, Math.max(1, Math.floor(duration / 2)))) recordListeningOnce();
  }

  async function recordListeningOnce() {
    const track = state.currentTrack;
    if (!track || state.lastHistoryRecorded) return;
    const id = String(track.id);
    if (state.lastHistoryTrackId !== id) {
      state.lastHistoryTrackId = id;
      state.lastHistoryRecorded = false;
    }
    const played = Math.floor(Number(audio.currentTime) || 0);
    const duration = Number(track.duration_sec) || Number(audio.duration) || 0;
    const required = duration > 0 ? Math.min(30, Math.max(1, Math.floor(duration / 2))) : 30;
    if (played < required) return;
    state.lastHistoryRecorded = true;
    try {
      await api("/api/listening/history", { method: "POST", body: JSON.stringify({ track: trackPayload(track), played_seconds: played }) });
    } catch (error) {
      state.lastHistoryRecorded = false;
      console.warn("Listening history could not be saved:", error.message);
    }
  }

  async function playTrack(track, list = null, index = 0, resumeAt = 0) {
    if (!track?.id) return;
    const requestId = ++state.playbackRequest;
    const newQueue = Array.isArray(list) && list.length ? list.map(trackPayload) : [trackPayload(track)];
    const safeIndex = Math.max(0, Math.min(Number(index) || 0, newQueue.length - 1));
    state.queue = newQueue;
    state.queueIndex = safeIndex;
    state.currentTrack = { ...newQueue[safeIndex] };
    state.playbackLoading = true;
    state.lastHistoryRecorded = false;
    state.lastHistoryTrackId = String(state.currentTrack.id);
    state.streamRecoveryAttempted = false;
    resetShuffleBag();
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    updatePlayer();
    try {
      const token = await api("/api/stream-token", { method: "POST", body: JSON.stringify({ video_id: state.currentTrack.id }) });
      if (requestId !== state.playbackRequest) return;
      if (!token.stream_url) throw new Error("Audio server returned an invalid stream URL.");
      audio.src = token.stream_url;
      audio.load();
      if (resumeAt > 0) {
        await waitForMetadata(requestId);
        if (requestId !== state.playbackRequest) return;
        const duration = Number(audio.duration) || 0;
        audio.currentTime = duration > 0 ? Math.min(resumeAt, Math.max(0, duration - 0.25)) : resumeAt;
      }
      if (requestId !== state.playbackRequest) return;
      await audio.play();
      if (requestId !== state.playbackRequest) return;
      state.playbackLoading = false;
      state.currentTrack = { ...state.currentTrack, stream_url: token.stream_url };
      state.queue[state.queueIndex] = trackPayload(state.currentTrack);
      updatePlayer();
      setMediaSession();
    } catch (error) {
      if (requestId !== state.playbackRequest || error?.name === "AbortError") return;
      state.playbackLoading = false;
      updatePlayer();
      showToast(error.message || "Unable to start this song.");
      console.error("Taalune playback failed:", error);
    }
  }

  function waitForMetadata(requestId) {
    if (requestId !== state.playbackRequest) return Promise.reject(new DOMException("Playback replaced", "AbortError"));
    if (audio.readyState >= 1) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let timer;
      const clean = () => {
        clearTimeout(timer);
        audio.removeEventListener("loadedmetadata", loaded);
        audio.removeEventListener("error", failed);
      };
      const loaded = () => {
        clean();
        requestId === state.playbackRequest ? resolve() : reject(new DOMException("Playback replaced", "AbortError"));
      };
      const failed = () => { clean(); reject(new Error("Audio metadata could not be loaded.")); };
      audio.addEventListener("loadedmetadata", loaded, { once: true });
      audio.addEventListener("error", failed, { once: true });
      timer = setTimeout(() => { clean(); reject(new Error("Audio loading timed out.")); }, 15000);
    });
  }

  async function togglePlay() {
    if (!state.currentTrack) {
      const fallback = state.homeTracks?.[0] || state.searchResults?.[0];
      if (fallback) return playTrack(fallback, state.homeTracks?.length ? state.homeTracks : [fallback], 0);
      throw new Error("Choose a song first.");
    }
    if (audio.paused) {
      if (!audio.src) return playTrack(state.currentTrack, state.queue, state.queueIndex);
      await audio.play();
    } else audio.pause();
    updatePlayer();
  }

  function clearPersonalPlayer() {
    state.playbackRequest += 1;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    state.currentTrack = null;
    state.queue = [];
    state.queueIndex = -1;
    state.lastHistoryRecorded = false;
    updatePlayer();
  }

  function resetShuffleBag() {
    state.shuffleBag = state.queue.map((_, index) => index).filter((index) => index !== state.queueIndex);
    for (let i = state.shuffleBag.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [state.shuffleBag[i], state.shuffleBag[j]] = [state.shuffleBag[j], state.shuffleBag[i]];
    }
  }

  function updateRepeatButton() {
    const button = $("repeatButton");
    if (!button) return;
    const labels = ["Repeat off", "Repeat all", "Repeat one"];
    button.classList.toggle("active", state.repeatMode !== 0);
    button.setAttribute("aria-label", labels[state.repeatMode]);
    button.title = labels[state.repeatMode];
    button.dataset.mode = String(state.repeatMode);
  }

  function updateShuffleButton() {
    $("shuffleButton")?.classList.toggle("active", state.shuffle);
  }

  async function nextTrack() {
    if (!state.queue.length) return;
    if (state.repeatMode === 2 && state.currentTrack) {
      audio.currentTime = 0;
      await audio.play();
      return;
    }
    let nextIndex;
    if (state.shuffle && state.queue.length > 1) {
      if (!state.shuffleBag.length) resetShuffleBag();
      nextIndex = state.shuffleBag.pop();
    } else {
      nextIndex = state.queueIndex + 1;
      if (nextIndex >= state.queue.length) {
        if (state.repeatMode === 1) nextIndex = 0;
        else { audio.pause(); updatePlayer(); return; }
      }
    }
    await playTrack(state.queue[nextIndex], state.queue, nextIndex);
  }

  async function previousTrack() {
    if (!state.queue.length) return;
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    const index = Math.max(0, state.queueIndex - 1);
    await playTrack(state.queue[index], state.queue, index);
  }

  function setMediaSession() {
    if (!("mediaSession" in navigator) || !state.currentTrack) return;
    const track = state.currentTrack;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || "Unknown title",
        artist: track.artist || "Unknown artist",
        album: "Taalune",
        artwork: track.thumbnail ? [{ src: track.thumbnail, sizes: "512x512", type: "image/jpeg" }] : []
      });
      navigator.mediaSession.setActionHandler("play", () => audio.play());
      navigator.mediaSession.setActionHandler("pause", () => audio.pause());
      navigator.mediaSession.setActionHandler("previoustrack", previousTrack);
      navigator.mediaSession.setActionHandler("nexttrack", nextTrack);
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (Number.isFinite(details.seekTime)) audio.currentTime = details.seekTime;
      });
    } catch (error) { console.debug("Media Session unavailable:", error); }
  }

  function setShuffle() {
    state.shuffle = !state.shuffle;
    if (state.shuffle) resetShuffleBag();
    updateShuffleButton();
    showToast(state.shuffle ? "Shuffle enabled" : "Shuffle disabled");
  }

  function setRepeat() {
    state.repeatMode = (state.repeatMode + 1) % 3;
    updateRepeatButton();
    showToast(["Repeat off", "Repeat all", "Repeat one"][state.repeatMode]);
  }

  function moveQueueItem(index, direction) {
    const source = Number(index);
    const destination = source + Number(direction);
    if (
      !Number.isInteger(source) ||
      !Number.isInteger(destination) ||
      source <= state.queueIndex ||
      destination <= state.queueIndex ||
      destination < 0 ||
      destination >= state.queue.length
    ) return;

    [state.queue[source], state.queue[destination]] = [
      state.queue[destination],
      state.queue[source]
    ];

    resetShuffleBag();
    renderQueue();
  }

  async function removeQueueItem(index) {
    if (!Number.isInteger(index) || index < 0 || index >= state.queue.length) return;

    if (index === state.queueIndex) {
      const remaining = state.queue.slice();
      remaining.splice(index, 1);

      if (!remaining.length) {
        clearPersonalPlayer();
        closeModal();
        showToast("Queue cleared");
        return;
      }

      const nextIndex = Math.min(index, remaining.length - 1);
      await playTrack(remaining[nextIndex], remaining, nextIndex);
      renderQueue();
      return;
    }

    state.queue.splice(index, 1);
    if (index < state.queueIndex) state.queueIndex -= 1;
    resetShuffleBag();
    renderQueue();
  }

  function openPlayer() {
    if (!state.currentTrack) return;
    $("fullPlayer").classList.add("open");
    $("fullPlayer").setAttribute("aria-hidden", "false");
  }

  function closePlayer() {
    $("fullPlayer").classList.remove("open");
    $("fullPlayer").setAttribute("aria-hidden", "true");
  }

  function setSleepTimer() {
    const minutesText = prompt("Stop playback after how many minutes? (1–180)", "30");
    if (minutesText === null) return;
    const minutes = Number(minutesText);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) throw new Error("Enter a time between 1 and 180 minutes.");
    clearTimeout(state.sleepTimer);
    state.sleepTimerEndsAt = Date.now() + minutes * 60000;
    state.sleepTimer = setTimeout(() => {
      audio.pause();
      state.sleepTimer = null;
      state.sleepTimerEndsAt = 0;
      showToast("Sleep timer stopped playback");
    }, minutes * 60000);
    showToast(`Sleep timer set for ${minutes} minutes`);
  }

  async function restoreGroup() {
    try {
      const saved = localStorage.getItem("taalune.selectedGroup");
      if (!saved || !/^-100\d{6,13}$/.test(saved)) return;
      const chatId = Number(saved);
      const data = await api(`/api/groups/${encodeURIComponent(chatId)}/status`);
      state.selectedGroup = { chat_id: chatId, title: data.group.title };
      state.groupStatus = data.group;
    } catch (_) {
      state.selectedGroup = null;
      state.groupStatus = null;
      try { localStorage.removeItem("taalune.selectedGroup"); } catch (_) {}
    }
  }

  function toggleSwitch(button) {
    const next = button.getAttribute("aria-checked") !== "true";
    button.setAttribute("aria-checked", String(next));
  }

  async function handleAction(button) {
    const action = button.dataset.action;
    const id = button.dataset.id;
    switch (action) {
      case "notifications": setPage("notifications"); break;
      case "refresh-home": await loadHome(true); break;
      case "create-playlist": createPlaylistModal(); break;
      case "submit-create-playlist": await createPlaylist(); break;
      case "submit-edit-playlist": await editPlaylist(); break;
      case "edit-playlist": editPlaylistModal(); break;
      case "edit-profile": editProfileModal(); break;
      case "submit-profile": await saveProfile(); break;
      case "open-playlist": await loadPlaylist(id); break;
      case "open-person": await openPerson(button.dataset.handle); break;
      case "playlist-track-remove": await removePlaylistTrack(id); break;
      case "playlist-track-up": await movePlaylistTrack(button.dataset.index, -1); break;
      case "playlist-track-down": await movePlaylistTrack(button.dataset.index, 1); break;
      case "like-track": { const track = findTrack(id); if (!track) throw new Error("Song details are unavailable."); await toggleTrackLike(track); break; }
      case "track-menu": { const track = findTrack(id); if (!track) throw new Error("Song details are unavailable."); await openTrackMenu(track); break; }
      case "play-track": {
        const track = findTrack(id);
        if (!track) throw new Error("Song details are unavailable. Search again.");
        let list = [track];
        if (state.page === "playlist") list = state.activePlaylist?.tracks || [track];
        else if (state.page === "library" && state.libraryScope === "liked") list = state.liked;
        else if (state.page === "library" && state.libraryScope === "history") list = state.history;
        else if (state.page === "home") list = state.homeTracks || [track];
        else if (state.page === "search" && state.searchMode === "music") list = state.searchResults;
        const index = Math.max(0, list.findIndex((item) => String(item.id) === String(track.id)));
        await playTrack(track, list, index);
        break;
      }
      case "modal-play-track": if (state.modalTrack) { closeModal(); await playTrack(state.modalTrack); } break;
      case "modal-like-track": if (state.modalTrack) { const track = state.modalTrack; closeModal(); await toggleTrackLike(track); } break;
      case "modal-group-play": if (state.modalTrack) { const track = state.modalTrack; closeModal(); await groupControl("play_track", { track: trackPayload(track) }); } break;
      case "modal-group-queue": if (state.modalTrack) { const track = state.modalTrack; closeModal(); await groupControl("queue_track", { track: trackPayload(track) }); } break;
      case "modal-add-playlist": { const playlistId = $("trackTargetPlaylist")?.value || state.modalTargetPlaylistId || state.activePlaylist?.id; if (!playlistId || !state.modalTrack) throw new Error("Choose a playlist first."); const track = state.modalTrack; closeModal(); await addTrackToPlaylist(track, playlistId); state.modalTargetPlaylistId = ""; break; }
      case "playlist-follow": await togglePlaylistFollow(id); break;
      case "like-playlist": await togglePlaylistLike(); break;
      case "play-playlist": if (!state.activePlaylist?.tracks?.length) throw new Error("This playlist is empty."); await playTrack(state.activePlaylist.tracks[0], state.activePlaylist.tracks, 0); break;
      case "add-from-search": if (!state.activePlaylist) throw new Error("Open a playlist first."); state.modalTargetPlaylistId = state.activePlaylist.id; setPage("search"); setSearchMode("music"); showToast("Use the more menu on a song to add it to this playlist."); break;
      case "group-play-playlist": if (!state.activePlaylist) throw new Error("Open a playlist first."); await groupControl("play_playlist", { playlist_id: state.activePlaylist.id }); break;
      case "group-queue-playlist": if (!state.activePlaylist) throw new Error("Open a playlist first."); await groupControl("queue_playlist", { playlist_id: state.activePlaylist.id }); break;
      case "group-track": { const track = findTrack(id); if (!track) throw new Error("Song details are unavailable."); await groupControl("queue_track", { track: trackPayload(track) }); break; }
      case "group-control": await groupControl(button.dataset.command); break;
      case "group-shuffle": await shuffleGroupQueue(); break;
      case "group-seek": await seekGroupTrack(); break;
      case "group-loop": await setGroupLoop(); break;
      case "group-volume": await setGroupVolume(); break;
      case "group-queue-up": await reorderGroupQueue(button.dataset.index, -1); break;
      case "group-queue-down": await reorderGroupQueue(button.dataset.index, 1); break;
      case "group-queue-remove": await removeGroupQueueTrack(id); break;
      case "connect-group": await connectGroup(); break;
      case "disconnect-group": disconnectGroup(); break;
      case "refresh-group": await refreshGroupStatus(); break;
      case "refresh-groups": await loadGroups(0); break;
      case "load-more-groups": await loadMoreGroups(); break;
      case "select-group": await selectGroup(id); break;
      case "playlist-report": await reportContent("playlist", state.activePlaylist?.id); break;
      case "report-person": await reportContent("user", id); break;
      case "report-track": if (state.modalTrack) await reportContent("track", state.modalTrack.id); break;
      case "block-person": await blockUser(id); break;
      case "unblock-user": await api(`/api/safety/blocks/${encodeURIComponent(id)}`, { method: "DELETE" }); await manageBlocks(); break;
      case "manage-blocks": await manageBlocks(); break;
      case "my-reports": await myReports(); break;
      case "respond-follow": await respondFollow(button); break;
      case "respond-invitation": await respondInvitation(button); break;
      case "read-notification": await markNotificationRead(id); break;
      case "invite-collaborator": openModal("Invite collaborator", `<div class="stack"><label class="field"><span>Telegram user ID</span><input id="inviteUserId" inputmode="numeric" placeholder="User ID"></label><label class="field"><span>Role</span><select id="inviteRole"><option value="editor">Editor</option><option value="contributor">Contributor</option><option value="viewer">Viewer</option></select></label></div>`, `<button class="secondary-button" data-action="close-modal">Cancel</button><button class="primary-button" data-action="send-invitation">Send invitation</button>`); break;
      case "send-invitation": await sendInvitation(); break;
      case "change-collaborator": await changeCollaborator(id); break;
      case "remove-collaborator": await removeCollaborator(id); break;
      case "delete-playlist": await deletePlaylist(); break;
      case "close-modal": closeModal(); break;
      case "open-player": openPlayer(); break;
      case "close-player": closePlayer(); break;
      case "toggle-play": await togglePlay(); break;
      case "next-track": await nextTrack(); break;
      case "previous-track": await previousTrack(); break;
      case "shuffle": setShuffle(); break;
      case "repeat": setRepeat(); break;
      case "open-queue": openQueue(); break;
      case "close-queue": closeModal(); break;
      case "queue-play": { const index = Number(button.dataset.index); if (state.queue[index]) { const q = state.queue.slice(); closeModal(); await playTrack(q[index], q, index); } break; }
      case "queue-remove": await removeQueueItem(Number(button.dataset.index)); break;
      case "queue-up": moveQueueItem(button.dataset.index, -1); break;
      case "queue-down": moveQueueItem(button.dataset.index, 1); break;
      case "like-current": if (state.currentTrack) await toggleTrackLike(state.currentTrack); break;
      case "sleep-timer": setSleepTimer(); break;
      case "save-settings": await saveSettings(); break;
      case "save-privacy": await savePrivacy(); break;
      case "export-account": await exportAccount(); break;
      case "delete-account": await requestDeletion(); break;
      case "confirm-deletion": await confirmDeletion(); break;
      case "admin-search": await adminSearchUsers(); break;
      case "admin-audit": await loadAdminAudit(); break;
      case "admin-ban": {
        const banned = button.dataset.banned !== "true";
        const reason = prompt(banned ? "Reason for ban" : "Reason for unban", "Policy violation") || "";
        await api(`/api/admin/users/${encodeURIComponent(id)}/ban`, { method: "POST", body: JSON.stringify({ banned, reason }) });
        await adminSearchUsers();
        showToast(banned ? "User banned" : "User unbanned");
        break;
      }
      case "admin-reports": await adminLoadModeration("reports"); break;
      case "admin-deletions": await adminLoadModeration("deletions"); break;
      case "review-report": {
        const decision = prompt("Decision: resolve or dismiss", "resolve");
        if (!decision) break;
        const action = prompt("Action: none, ban_user, unban_user, hide_playlist, restore_playlist", "none") || "none";
        const note = prompt("Moderator note", "") || "";
        await api(`/api/admin/moderation/reports/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ decision, action, note }) });
        await adminLoadModeration("reports");
        break;
      }
      case "review-deletion": {
        const decision = prompt("Decision: approve or reject", "approve");
        if (!decision) break;
        const note = prompt("Moderator note", "") || "";
        await api(`/api/admin/moderation/deletion-requests/${encodeURIComponent(id)}/process`, { method: "POST", body: JSON.stringify({ decision, note }) });
        await adminLoadModeration("deletions");
        break;
      }
      default: break;
    }
  }

  document.addEventListener("click", async (event) => {
    const pageButton = event.target.closest("[data-page]");
    if (pageButton) {
      event.preventDefault();
      setPage(pageButton.dataset.page);
      return;
    }
    const searchMode = event.target.closest("[data-search-mode]");
    if (searchMode) { setSearchMode(searchMode.dataset.searchMode); return; }
    const libraryScope = event.target.closest("[data-library-scope]");
    if (libraryScope) { await showLibraryScope(libraryScope.dataset.libraryScope); return; }
    const button = event.target.closest("[data-action]");
    if (!button || button.disabled) return;
    try { await handleAction(button); }
    catch (error) { showToast(error.message || "Something went wrong."); console.error("Taalune action failed:", error); }
  });

  document.addEventListener("input", (event) => {
    if (event.target.id === "searchInput") {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => runSearch(), 300);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.target.id === "searchInput" && event.key === "Enter") {
      event.preventDefault();
      clearTimeout(state.searchTimer);
      runSearch();
    }
    if (event.target.id === "groupIdInput" && event.key === "Enter") {
      event.preventDefault();
      connectGroup().catch((error) => showToast(error.message));
    }
    if (event.key === "Escape") {
      closeModal();
      closePlayer();
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-setting], [data-privacy]")) toggleSwitch(event.target);
    if (event.target.id === "volume") audio.volume = Math.max(0, Math.min(1, Number(event.target.value) / 100));
    if (event.target.id === "playbackSpeed") audio.playbackRate = Math.max(0.5, Math.min(2, Number(event.target.value) || 1));
    if (["newPlaylistCover", "editPlaylistCover", "profileAvatar"].includes(event.target.id)) {
      const file = event.target.files?.[0];
      if (file && (file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
        event.target.value = "";
        showToast(file.size > 5 * 1024 * 1024 ? "Image must be 5 MB or smaller." : "Use a valid JPG, PNG or WebP image.");
      }
    }
  });

  $("seek").addEventListener("input", () => {
    const duration = Number(audio.duration);
    if (Number.isFinite(duration) && duration > 0) audio.currentTime = (Number($("seek").value) / 1000) * duration;
  });

  audio.addEventListener("timeupdate", updateProgress);
  audio.addEventListener("loadedmetadata", updateProgress);
  audio.addEventListener("play", updatePlayer);
  audio.addEventListener("pause", updatePlayer);
  audio.addEventListener("ended", async () => {
    try { await nextTrack(); } catch (error) { showToast(error.message); }
  });
  audio.addEventListener("error", async () => {
    if (!state.currentTrack || state.playbackLoading || !audio.currentSrc || state.streamRecoveryAttempted) {
      if (state.currentTrack && !state.playbackLoading && state.streamRecoveryAttempted) showToast("Audio stream could not be recovered. Try playing this song again.");
      return;
    }
    state.streamRecoveryAttempted = true;
    state.playbackLoading = true;
    const trackId = String(state.currentTrack.id);
    const requestId = state.playbackRequest;
    const resumeAt = Math.max(0, Number(audio.currentTime) || 0);
    try {
      const token = await api("/api/stream-token", { method: "POST", body: JSON.stringify({ video_id: trackId }) });
      if (requestId !== state.playbackRequest || String(state.currentTrack?.id) !== trackId) return;
      audio.src = token.stream_url;
      audio.load();
      await waitForMetadata(requestId);
      if (requestId !== state.playbackRequest) return;
      const duration = Number(audio.duration) || 0;
      audio.currentTime = duration > 0 ? Math.min(resumeAt, Math.max(0, duration - 0.25)) : resumeAt;
      await audio.play();
      state.currentTrack.stream_url = token.stream_url;
      showToast("Audio source refreshed");
    } catch (error) {
      if (requestId === state.playbackRequest) showToast(error.message || "Audio source refresh failed.");
    } finally {
      if (requestId === state.playbackRequest) state.playbackLoading = false;
    }
  });
  audio.volume = 0.85;

  async function boot() {
    updateRepeatButton();
    updateShuffleButton();
    if (tg) {
      try {
        tg.ready();
        tg.expand();
        tg.setHeaderColor("#101112");
        tg.setBackgroundColor("#101112");
      } catch (_) {}
    }
    if (!initData) {
      $("mainContent").innerHTML = emptyState("Open Taalune from the Telegram bot to sign in securely.");
      document.querySelector(".bottom-nav").hidden = true;
      return;
    }
    try {
      await createSession();
      await restoreGroup();
      await loadProfile();
      await Promise.allSettled([loadLiked()]);
      await loadHome(true);
    } catch (error) {
      console.error("Taalune startup failed:", error);
      $("page-home").innerHTML = emptyState(error.message || "Unable to open Taalune.");
    }
  }

  boot();
})();
