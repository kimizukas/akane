(() => {
  "use strict";

  const tg = window.Telegram?.WebApp;
  const initData = tg?.initData || "";
  const $ = id => document.getElementById(id);
  const audio = $("audio");

  const state = {
    page: "home",
    profile: null,
    playlists: [],
    discover: [],
    liked: [],
    likedLoaded: false,
    notifications: [],
    searchMode: "music",
    searchQuery: "",
    searchResults: [],
    libraryScope: "mine",
    activePlaylist: null,
    activePerson: null,
    selectedGroup: null,
    groupStatus: null,
    addTargetPlaylist: null,
    queue: [],
    queueIndex: -1,
    currentTrack: null,
    shuffle: false,
    repeat: false,
    dragId: null,
    modalTrack: null,
    modalPeople: [],
    selectedInvite: null,
    searchRequest: 0,
    playbackRequest: 0,

    homeTracks: [],
    homeQuery: "popular Hindi songs",
    homeLoadedAt: 0,
    homeRequest: 0
  };

  let searchTimer = null;
  const previewObjectUrls = new Map();
  const UPLOAD_FIELDS = {
    newPlaylistCoverFile: { preview: "newPlaylistCoverPreview", wrap: "newPlaylistCoverPreviewWrap", progress: "newPlaylistCoverProgress", progressWrap: "newPlaylistCoverProgressWrap", status: "newPlaylistCoverStatus" },
    editPlaylistCoverFile: { preview: "editPlaylistCoverPreview", wrap: "editPlaylistCoverPreviewWrap", progress: "editPlaylistCoverProgress", progressWrap: "editPlaylistCoverProgressWrap", status: "editPlaylistCoverStatus" },
    profileAvatarFile: { preview: "profileAvatarPreview", wrap: "profileAvatarPreviewWrap", progress: "profileAvatarProgress", progressWrap: "profileAvatarProgressWrap", status: "profileAvatarStatus" }
  };

  const ICONS = {
    music: '<path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path>',
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"></path>',
    search: '<circle cx="10.8" cy="10.8" r="7.2"></circle><path d="m16.2 16.2 4.3 4.3"></path>',
    library: '<path d="M4 4h16v16H4z"></path><path d="M8 8h8M8 12h8M8 16h5"></path>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"></path>',
    user: '<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>',
    plus: '<path d="M12 5v14M5 12h14"></path>',
    heart: '<path d="M20.8 8.8c0 5.2-8.8 11-8.8 11s-8.8-5.8-8.8-11A4.8 4.8 0 0 1 12 6.2a4.8 4.8 0 0 1 8.8 2.6Z"></path>',
    heartFill: '<path fill="currentColor" stroke="none" d="M20.8 8.8c0 5.2-8.8 11-8.8 11s-8.8-5.8-8.8-11A4.8 4.8 0 0 1 12 6.2a4.8 4.8 0 0 1 8.8 2.6Z"></path>',
    play: '<path fill="currentColor" stroke="none" d="M7 4.8c0-.8.9-1.3 1.6-.9l11 7.2a1.1 1.1 0 0 1 0 1.8l-11 7.2c-.7.4-1.6-.1-1.6-.9z"></path>',
    pause: '<path d="M8 5h3v14H8zM15 5h3v14h-3z"></path>',
    next: '<path d="M5 5v14l10-7zM19 5v14"></path>',
    previous: '<path d="M19 5v14L9 12zM5 5v14"></path>',
    shuffle: '<path d="m16 3 4 4-4 4M4 17l5-5 3-3 4-3h4M16 17l4 4-4 4M4 7l5 5 3 3"></path>',
    repeat: '<path d="m17 1 4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"></path>',
    queue: '<path d="M4 6h16M4 12h16M4 18h10"></path>',
    close: '<path d="m6 6 12 12M18 6 6 18"></path>',
    down: '<path d="m6 9 6 6 6-6"></path>',
    up: '<path d="m6 15 6-6 6 6"></path>',
    check: '<path d="m5 12 4 4L19 6"></path>',
    grip: '<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"></path>',
    refresh: '<path d="M20 7v5h-5"></path><path d="M20 12a8 8 0 1 1-2.3-5.7L20 9"></path>',
    upload: '<path d="M12 16V4m-5 5 5-5 5 5"></path><path d="M4 16v4h16v-4"></path>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="m21 15-5-5L5 21"></path>',
    star: '<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"></path>',
    moon: '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z"></path>',
    headphones: '<path d="M3 14v-3a9 9 0 0 1 18 0v3"></path><rect x="2" y="13" width="5" height="8" rx="2"></rect><rect x="17" y="13" width="5" height="8" rx="2"></rect>',
    trash: '<path d="M3 6h18M8 6V4h8v2m-10 0 1 14h10l1-14M10 10v6m4-6v6"></path>',
    sparkle: '<path d="m12 3 1.5 6.5L20 12l-6.5 1.5L12 20l-1.5-6.5L4 12l6.5-2.5z"></path>',
    globe: '<circle cx="12" cy="12" r="10"></circle><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"></path>'
  };

  function svgIcon(name, size = 18) {
    const paths = ICONS[name] || ICONS.music;

    return `
      <svg
        class="svg-icon"
        width="${Number(size) || 18}"
        height="${Number(size) || 18}"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >${paths}</svg>
    `;
  }

  function playlistIcon(value, size = 24) {
    const aliases = {
      music: "music",
      heart: "heart",
      chill: "moon",
      star: "star",
      headphones: "headphones",
      group: "users"
    };

    const iconName = aliases[String(value || "").toLowerCase()] || "music";
    return svgIcon(iconName, size);
  }

  if (tg) {
    tg.ready();
    tg.expand();

    try {
      tg.setHeaderColor("#120e16");
      tg.setBackgroundColor("#120e16");
    } catch (_) {}
  }

  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));

  const shortTime = value => {
    const n = Math.max(0, Number(value) || 0);

    return `${Math.floor(n / 60)}:${String(
      Math.floor(n % 60)
    ).padStart(2, "0")}`;
  };

  const img = (url, cls = "") => url
    ? `<img class="${cls}" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<div class="${cls} cover-placeholder">${svgIcon("music", 34)}</div>`;

  const coverImage = (url, cls = "", fallback = "music") => url
    ? `<img class="${cls}" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<div class="${cls} cover-placeholder">${playlistIcon(fallback, 38)}</div>`;

  const showToast = message => {
    const el = $("toast");
    if (!el) return;

    el.textContent = String(message || "Something went wrong");
    el.classList.add("show");

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {
      el.classList.remove("show");
    }, 2800);
  };

  const API_MESSAGES = {
    unauthorized: "Open Taalune from the Telegram bot to sign in.",
    invalid_chat_id: "That Telegram group ID is invalid.",
    group_only: "Enter a Telegram supergroup ID.",
    supergroup_required: "This group must be a supergroup.",
    bot_cannot_access_group: "The music bot is not in this group or cannot access it.",
    assistant_unavailable: "The assigned music assistant is unavailable.",
    userbot_cannot_verify_membership: "The assistant could not verify your group membership.",
    not_group_member: "You are not a member of this group.",
    bot_not_in_group: "Add the music bot to this group first.",
    assistant_not_in_group: "The assigned assistant account is not in this group.",
    unable_to_verify_group_clients: "The bot and assistant membership could not be verified.",
    group_control_permission_denied: "You can view this group, but you cannot control its playback.",
    voice_chat_playback_not_started: "The voice chat is not active or playback could not start.",
    nothing_playing: "Nothing is playing in this group.",
    already_paused: "Group playback is already paused.",
    already_playing: "Group playback is already playing.",
    group_queue_limit: "The group queue is full.",
    playlist_empty: "This playlist has no songs yet.",
    duplicate_track: "This song is already in this playlist.",
    playlist_track_limit: "This playlist has reached its track limit.",
    playlist_version_conflict: "This playlist changed. Reload it and try again.",
    playlist_changed_retry: "This playlist changed. Reload and try again.",
    private_playlist: "You do not have access to this playlist.",
    private_playlist_cannot_be_followed: "Private playlists cannot be followed.",
    permission_denied: "You do not have permission to perform this action.",
    owner_only_visibility: "Only the playlist owner can change its visibility.",
    collaborator_not_found: "That collaborator is no longer on this playlist.",
    invitation_not_found: "This invitation is no longer available.",
    image_required: "Choose an image first.",
    image_too_large: "Image must be 5 MB or smaller.",
    unsupported_image: "Use a valid JPG, PNG or WebP image.",
    catbox_unavailable: "Catbox is temporarily unavailable. Try again later.",
    catbox_invalid_response: "Catbox returned an invalid upload response."
  };

  async function api(path, options = {}) {
    if (!initData) {
      throw new Error("Open Taalune from the Telegram bot to continue.");
    }

    const headers = {
      "X-Telegram-Init-Data": initData,
      ...(options.headers || {})
    };

    const isFormData =
      typeof FormData !== "undefined" &&
      options.body instanceof FormData;

    if (
      options.body &&
      !isFormData &&
      !headers["Content-Type"]
    ) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(path, {
      ...options,
      headers
    });

    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : {};

    if (!response.ok || data.ok === false) {
      const code = data.error || "";

      throw new Error(
        API_MESSAGES[code] ||
        data.message ||
        code ||
        `Request failed (${response.status})`
      );
    }

    return data;
  }

  function go(page) {
    state.page = page;

    document.querySelectorAll(".page").forEach(el => {
      el.classList.toggle("active", el.id === `page-${page}`);
    });

    document.querySelectorAll(".nav-btn").forEach(el => {
      el.classList.toggle("active", el.dataset.page === page);
    });

    window.scrollTo({ top: 0, behavior: "smooth" });

    if (page === "home") loadHome();
    if (page === "library") loadLibrary();
    if (page === "profile") renderProfile();
    if (page === "notifications") loadNotifications();
    if (page === "search") renderSearchShell();
    if (page === "groups") renderGroups();
    if (page === "playlist") renderPlaylist();
  }

  function setAvatar() {
    const profile = state.profile;
    const element = $("topAvatar");

    if (!element) return;

    element.src = profile?.avatar_url || "";
    element.style.visibility = profile?.avatar_url ? "visible" : "hidden";
  }

  function playlistCard(playlist) {
    return `
      <article class="playlist-card">
        <button class="ghost"
          style="padding:0;width:100%;text-align:left"
          data-action="open-playlist"
          data-id="${esc(playlist.id)}">

          ${coverImage(
            playlist.cover_url,
            "cover",
            playlist.icon
          )}

          <div class="card-title">${esc(playlist.name)}</div>

          <div class="card-meta">
            ${esc(playlist.visibility)}
            · ${Number(playlist.track_count || 0)} songs
          </div>
        </button>

        <div class="row" style="justify-content:space-between;margin-top:8px">
          <span class="small muted">
            ${svgIcon("heart", 13)}
            ${Number(playlist.like_count || 0)}
          </span>

          ${playlist.owner?.user_id === state.profile?.user_id ? "" : `
            <button class="track-action"
              data-action="playlist-follow"
              data-id="${esc(playlist.id)}"
              aria-label="Follow playlist">
              ${playlist.followed
                ? svgIcon("check", 17)
                : svgIcon("plus", 17)}
            </button>
          `}
        </div>
      </article>
    `;
  }

  function trackRow(track, index, options = {}) {
    const liked = isTrackLiked(track.id);
    return `
      <div class="track-row"
        ${options.draggable ? 'draggable="true"' : ""}
        data-track-id="${esc(track.id)}"
        data-index="${index}">

        ${options.draggable
          ? `<span class="track-grip" title="Drag to reorder">${svgIcon("grip", 18)}</span>`
          : ""}

        ${img(track.thumbnail, "track-cover")}

        <div class="grow">
          <div class="track-title">${esc(track.title)}</div>
          <div class="track-sub">
            ${esc(track.artist || "Unknown artist")}
            · ${shortTime(track.duration_sec)}
          </div>
        </div>

        <div class="track-actions">
          <button class="track-action"
            data-action="like-track"
            data-id="${esc(track.id)}"
            title="${liked ? "Unlike" : "Like"}"
            aria-label="${liked ? "Unlike song" : "Like song"}"
            aria-pressed="${liked ? "true" : "false"}">
            ${svgIcon(liked ? "heartFill" : "heart", 18)}
          </button>

          ${options.add ? `
            <button class="track-action"
              data-action="add-track"
              data-id="${esc(track.id)}"
              title="Add to playlist"
              aria-label="Add to playlist">
              ${svgIcon("plus", 18)}
            </button>
          ` : ""}

          ${options.group ? `
            <button class="track-action"
              data-action="group-track"
              data-id="${esc(track.id)}"
              title="Add to group queue"
              aria-label="Add to group queue">
              ${svgIcon("users", 18)}
            </button>
          ` : ""}

          ${options.reorder ? `
            <div class="track-management">
              <button data-action="move-track-up"
                data-id="${esc(track.id)}"
                title="Move up">
                ${svgIcon("up", 15)}
              </button>

              <button data-action="move-track-down"
                data-id="${esc(track.id)}"
                title="Move down">
                ${svgIcon("down", 15)}
              </button>
            </div>
          ` : ""}

          ${options.remove ? `
            <button class="track-action remove-track"
              data-action="remove-track"
              data-id="${esc(track.id)}"
              title="Remove from playlist"
              aria-label="Remove from playlist">
              ${svgIcon("trash", 16)}
            </button>
          ` : ""}

          <button class="play-circle"
            data-action="play-track"
            data-id="${esc(track.id)}"
            title="Play"
            aria-label="Play song">
            ${svgIcon("play", 17)}
          </button>
        </div>
      </div>
    `;
  }

  async function loadProfile() {
    const result = await api("/api/profile");
    state.profile = result.profile;
    setAvatar();
  }

  function isTrackLiked(trackId) {
    return state.liked.some(item => String(item.id) === String(trackId));
  }

  function updateTrackLikeButtons(trackId, liked) {
    document.querySelectorAll('[data-action="like-track"]').forEach(button => {
      if (String(button.dataset.id) !== String(trackId)) return;
      button.innerHTML = svgIcon(liked ? "heartFill" : "heart", 18);
      button.title = liked ? "Unlike" : "Like";
      button.setAttribute("aria-label", liked ? "Unlike song" : "Like song");
      button.setAttribute("aria-pressed", liked ? "true" : "false");
    });
  }

  async function loadLikedTracks() {
    const data = await api("/api/library/liked-tracks?limit=50");
    state.liked = Array.isArray(data.results) ? data.results : [];
    state.likedLoaded = true;
    if (state.currentTrack) updatePlayer();
  }

  async function toggleTrackLike(track) {
    if (!track || !track.id) throw new Error("Song details are unavailable.");
    if (!state.likedLoaded) await loadLikedTracks();
    const trackId = String(track.id);
    if (isTrackLiked(trackId)) {
      await api("/api/tracks/" + encodeURIComponent(trackId) + "/like", { method: "DELETE" });
      state.liked = state.liked.filter(item => String(item.id) !== trackId);
      updateTrackLikeButtons(trackId, false);
      showToast("Removed from Liked Songs");
    } else {
      const payload = { id: track.id, title: track.title, artist: track.artist || "Unknown artist", duration_sec: Number(track.duration_sec || 0), thumbnail: track.thumbnail || null };
      await api("/api/tracks/" + encodeURIComponent(trackId) + "/like", { method: "POST", body: JSON.stringify(payload) });
      state.liked = [payload, ...state.liked.filter(item => String(item.id) !== trackId)];
      updateTrackLikeButtons(trackId, true);
      showToast("Added to Liked Songs");
    }
    if (state.currentTrack && String(state.currentTrack.id) === trackId) updatePlayer();
    if (state.page === "library" && state.libraryScope === "liked") await showLibraryScope("liked");
  }

  async function loadHome() {
    const page = $("page-home");

    page.innerHTML = `
      <section class="home-hero">
        <div class="eyebrow">Your daily soundtrack</div>

        <h1 class="page-title">
          A little music<br>for every mood.
        </h1>

        <p>
          Find something you love, save it to a playlist,
          or start a group queue.
        </p>

        <div class="home-hero-actions">
          <button class="primary" data-page="search">
            ${svgIcon("search", 16)}
            Find music
          </button>

          <button class="secondary" data-page="library">
            ${svgIcon("library", 16)}
            Your library
          </button>
        </div>
      </section>

      <div class="section-head">
        <h2>Picked for you</h2>

        <button data-action="refresh-home">
          ${svgIcon("refresh", 14)}
          Refresh
        </button>
      </div>

      <div class="pill-row" id="homeSuggestionModes">
        <button class="suggestion-chip active"
          data-home-query="popular Hindi songs">For you</button>

        <button class="suggestion-chip"
          data-home-query="trending Hindi songs">Hindi hits</button>

        <button class="suggestion-chip"
          data-home-query="new Hindi songs 2026">New finds</button>

        <button class="suggestion-chip"
          data-home-query="popular English songs">English</button>

        <button class="suggestion-chip"
          data-home-query="lofi chill songs">Chill</button>

        <button class="suggestion-chip"
          data-home-query="romantic songs">Romantic</button>

        <button class="suggestion-chip"
          data-home-query="trending songs 2026">Trending</button>
      </div>

      <div id="homeSongStatus" class="muted small home-song-status">
        Finding songs for you…
      </div>

      <div id="homeTracks" class="list home-track-list">
        <div class="empty">Loading song suggestions…</div>
      </div>

      <div class="section-head">
        <h2>Discover playlists</h2>
        <button data-page="library">Explore</button>
      </div>

      <div id="homeDiscover" class="grid">
        <div class="empty">Loading playlists…</div>
      </div>

      <div class="section-head">
        <h2>Your playlists</h2>
        <button data-action="create-playlist">
          ${svgIcon("plus", 14)}
          Create
        </button>
      </div>

      <div id="homeMine" class="grid"></div>
    `;

    const [discoverResult, mineResult] = await Promise.allSettled([
      api("/api/playlists?scope=discover&limit=12"),
      api("/api/playlists?scope=mine&limit=12")
    ]);

    if (discoverResult.status === "fulfilled") {
      state.discover = discoverResult.value.results || [];

      $("homeDiscover").innerHTML = state.discover.length
        ? state.discover.map(playlistCard).join("")
        : '<div class="empty" style="grid-column:1/-1">Public playlists will appear here.</div>';
    } else {
      $("homeDiscover").innerHTML =
        `<div class="empty" style="grid-column:1/-1">${esc(discoverResult.reason.message)}</div>`;
    }

    if (mineResult.status === "fulfilled") {
      state.playlists = mineResult.value.results || [];

      $("homeMine").innerHTML = state.playlists.length
        ? state.playlists.map(playlistCard).join("")
        : '<div class="empty" style="grid-column:1/-1">Create your first playlist.</div>';
    } else {
      $("homeMine").innerHTML =
        `<div class="empty" style="grid-column:1/-1">${esc(mineResult.reason.message)}</div>`;
    }

    await loadHomeTracks(state.homeQuery, false);
  }

  async function loadHomeTracks(query = state.homeQuery, force = false) {
    const cleanQuery = String(query || "popular Hindi songs")
      .trim()
      .slice(0, 120);

    const target = $("homeTracks");
    const status = $("homeSongStatus");

    if (!target || !status) return;

    const sameQuery = cleanQuery === state.homeQuery;

    if (
      !force &&
      sameQuery &&
      state.homeTracks.length &&
      Date.now() - state.homeLoadedAt < 180000
    ) {
      target.innerHTML = state.homeTracks.map((track, index) => trackRow(track, index, { add: true, group: Boolean(state.selectedGroup) })).join("");
      status.textContent = "Suggestions · " + state.homeTracks.length + " songs";
      return;
    }

    state.homeQuery = cleanQuery;

    document.querySelectorAll("[data-home-query]").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.homeQuery === cleanQuery
      );
    });

    const requestId = ++state.homeRequest;

    status.textContent = "Finding songs…";
    target.innerHTML = '<div class="empty">Loading songs…</div>';

    try {
      const data = await api("/api/search", {
        method: "POST",
        body: JSON.stringify({ query: cleanQuery })
      });

      if (requestId !== state.homeRequest) return;

      state.homeTracks = data.results || [];
      state.homeLoadedAt = Date.now();

      target.innerHTML = state.homeTracks.length
        ? state.homeTracks.map((track, index) => trackRow(track, index, {
            add: true,
            group: Boolean(state.selectedGroup)
          })).join("")
        : '<div class="empty">No songs found. Try another category.</div>';

      status.textContent = state.homeTracks.length
        ? `Suggestions · ${state.homeTracks.length} songs`
        : "Try another category.";

    } catch (error) {
      if (requestId !== state.homeRequest) return;

      state.homeTracks = [];
      target.innerHTML = `<div class="empty">${esc(error.message)}</div>`;
      status.textContent = "Could not load song suggestions.";
    }
  }

  function renderSearchShell() {
    $("page-search").innerHTML = `
      <div class="eyebrow">Find something to play</div>
      <h1 class="page-title">Search</h1>

      <div class="searchbar">
        ${svgIcon("search", 18)}
        <input id="searchInput"
          autocomplete="off"
          maxlength="120"
          placeholder="Songs, people or playlists"
          value="${esc(state.searchQuery)}">
      </div>

      <div class="pill-row">
        <button class="pill ${state.searchMode === "music" ? "active" : ""}"
          data-search-mode="music">
          ${svgIcon("music", 15)} Music
        </button>

        <button class="pill ${state.searchMode === "people" ? "active" : ""}"
          data-search-mode="people">
          ${svgIcon("users", 15)} People
        </button>

        <button class="pill ${state.searchMode === "playlists" ? "active" : ""}"
          data-search-mode="playlists">
          ${svgIcon("library", 15)} Playlists
        </button>
      </div>

      <div id="searchStatus" class="muted small" style="margin:12px 0">
        Search songs, find people or discover playlists.
      </div>

      <div id="searchResults" class="list"></div>
    `;

    if (state.searchQuery.length >= 2) {
      runSearch();
    }
  }

  async function runSearch() {
    const input = $("searchInput");
    if (!input) return;

    const query = input.value.trim();
    state.searchQuery = query;

    const results = $("searchResults");
    const status = $("searchStatus");

    if (query.length < 2) {
      status.textContent = "Type at least two characters.";
      results.replaceChildren();
      return;
    }

    const requestId = ++state.searchRequest;

    status.textContent = "Searching…";
    results.replaceChildren();

    try {
      let data;

      if (state.searchMode === "music") {
        data = await api("/api/search", {
          method: "POST",
          body: JSON.stringify({ query })
        });
      } else {
        data = await api(
          `/api/search/${state.searchMode}?q=${encodeURIComponent(query)}&limit=25`
        );
      }

      if (requestId !== state.searchRequest) return;

      state.searchResults = data.results || [];

      if (state.searchMode === "music") {
        results.className = "list";

        results.innerHTML = state.searchResults.length
          ? state.searchResults.map((track, index) => trackRow(track, index, {
              add: true,
              group: Boolean(state.selectedGroup)
            })).join("")
          : '<div class="empty">No songs found.</div>';

      } else if (state.searchMode === "people") {
        results.className = "list";

        results.innerHTML = state.searchResults.length
          ? state.searchResults.map(person => `
              <div class="person-row">
                ${img(person.avatar_url, "person-avatar")}

                <div class="grow">
                  <div class="track-title">${esc(person.display_name)}</div>

                  <div class="track-sub">
                    @${esc(person.handle)} ·
                    ${person.visibility === "private"
                      ? "Private profile"
                      : `${Number(person.followers || 0)} followers`}
                  </div>
                </div>

                <button class="secondary"
                  data-action="follow-person"
                  data-id="${esc(person.user_id)}"
                  data-state="${esc(person.follow_state || "")}">
                  ${person.follow_state === "accepted"
                    ? "Following"
                    : person.follow_state === "pending"
                      ? "Requested"
                      : "Follow"}
                </button>

                <button class="icon-btn"
                  data-action="open-person"
                  data-handle="${esc(person.handle)}"
                  aria-label="Open profile">
                  ${svgIcon("user", 18)}
                </button>
              </div>
            `).join("")
          : '<div class="empty">No people found.</div>';

      } else {
        results.className = "grid";

        results.innerHTML = state.searchResults.length
          ? state.searchResults.map(playlistCard).join("")
          : '<div class="empty" style="grid-column:1/-1">No public playlists found.</div>';
      }

      status.textContent =
        `${state.searchResults.length} result${state.searchResults.length === 1 ? "" : "s"}`;

    } catch (error) {
      if (requestId !== state.searchRequest) return;
      status.textContent = error.message;
    }
  }

  function setSearchMode(mode) {
    if (!["music", "people", "playlists"].includes(mode)) return;

    state.searchMode = mode;

    document.querySelectorAll("[data-search-mode]").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.searchMode === mode
      );
    });

    runSearch();
  }

  async function loadLibrary() {
    $("page-library").innerHTML = `
      <div class="eyebrow">Your collection</div>

      <div class="row" style="justify-content:space-between">
        <h1 class="page-title">Your Library</h1>

        <button class="primary" data-action="create-playlist">
          ${svgIcon("plus", 15)} Create
        </button>
      </div>

      <div class="pill-row">
        <button class="pill" data-library-scope="mine">Playlists</button>
        <button class="pill" data-library-scope="following">Following</button>
        <button class="pill" data-library-scope="collaborating">Collaborating</button>
        <button class="pill" data-library-scope="liked">Liked songs</button>
      </div>

      <div id="libraryItems" class="grid" style="margin-top:14px"></div>
    `;

    await showLibraryScope("mine");
  }

  async function showLibraryScope(scope) {
    state.libraryScope = scope;

    document.querySelectorAll("[data-library-scope]").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.libraryScope === scope
      );
    });

    const target = $("libraryItems");
    if (!target) return;

    target.className = scope === "liked" ? "list" : "grid";