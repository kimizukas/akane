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
            title="Like"
            aria-label="Like song">
            ${svgIcon("heart", 18)}
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
                  data-id="${esc(person.user_id)}">
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
    target.innerHTML = '<div class="empty">Loading…</div>';

    try {
      if (scope === "liked") {
        const data = await api("/api/library/liked-tracks?limit=50");
        state.liked = data.results || [];

        target.innerHTML = state.liked.length
          ? state.liked.map((track, index) => trackRow(track, index)).join("")
          : '<div class="empty">Songs you like will live here.</div>';

      } else {
        const data = await api(
          `/api/playlists?scope=${encodeURIComponent(scope)}&limit=50`
        );

        const items = data.results || [];

        if (scope === "mine") {
          state.playlists = items;
        }

        target.innerHTML = items.length
          ? items.map(playlistCard).join("")
          : '<div class="empty" style="grid-column:1/-1">Nothing here yet.</div>';
      }

    } catch (error) {
      target.innerHTML =
        `<div class="empty" style="grid-column:1/-1">${esc(error.message)}</div>`;
    }
  }

  function renderGroups() {
    const preset = new URLSearchParams(location.search).get("chat_id") || "";
    const value = state.selectedGroup?.chat_id || preset;

    $("page-groups").innerHTML = `
      <div class="eyebrow">Telegram voice chats</div>
      <h1 class="page-title">Group player</h1>

      <p class="muted small">
        Connect a group to control its voice-chat playback.
        Your personal player remains separate.
      </p>

      <div class="searchbar">
        ${svgIcon("users", 18)}
        <input id="groupIdInput"
          inputmode="numeric"
          placeholder="Supergroup ID · -100…"
          value="${esc(value)}">
      </div>

      <button class="primary" data-action="check-group">
        Connect group
      </button>

      <div id="groupStatusPanel" style="margin-top:18px">
        <div class="empty">
          ${state.selectedGroup
            ? "Checking selected group…"
            : "Enter a supergroup ID to connect."}
        </div>
      </div>
    `;

    if (state.selectedGroup) {
      refreshGroupStatus().catch(error => {
        const panel = $("groupStatusPanel");

        if (panel) {
          panel.innerHTML =
            `<div class="empty group-error">${esc(error.message)}</div>`;
        }
      });
    }
  }

  async function refreshGroupStatus() {
    if (!state.selectedGroup) {
      throw new Error("Connect a group first.");
    }

    const panel = $("groupStatusPanel");
    if (!panel) return;

    const data = await api(
      `/api/groups/${encodeURIComponent(state.selectedGroup.chat_id)}/status`
    );

    state.groupStatus = data.group;

    const group = data.group;
    const current = group.current;

    panel.innerHTML = `
      <div class="group-panel">
        <div class="row">
          <div class="grow">
            <div class="track-title">${esc(group.title)}</div>

            <div class="track-sub">
              ${esc(group.chat_id)}
              · You: ${esc(group.user_status)}
            </div>
          </div>

          <span class="small ${group.can_control ? "group-ok" : "muted"}">
            ${group.can_control ? "Control access" : "View only"}
          </span>
        </div>
      </div>

      <div class="section-head">
        <h2>Now playing</h2>

        <span class="small muted">
          ${group.active
            ? (group.playing ? "Playing" : "Paused")
            : "Not playing"}
        </span>
      </div>

      ${current ? `
        <div class="track-row">
          ${img(current.thumbnail, "track-cover")}

          <div class="grow">
            <div class="track-title">${esc(current.title)}</div>

            <div class="track-sub">
              ${esc(current.artist)}
              · ${shortTime(current.duration_sec)}
            </div>
          </div>
        </div>
      ` : '<div class="empty">Nothing is playing in this group.</div>'}

      ${group.can_control ? `
        <div class="detail-actions">
          ${group.active ? `
            <button class="secondary"
              data-action="group-control"
              data-command="${group.playing ? "pause" : "resume"}">
              ${group.playing
                ? `${svgIcon("pause", 15)} Pause`
                : `${svgIcon("play", 15)} Resume`}
            </button>

            <button class="secondary"
              data-action="group-control"
              data-command="skip">
              ${svgIcon("next", 15)} Next
            </button>

            <button class="danger"
              data-action="group-control"
              data-command="stop">
              ${svgIcon("close", 15)} Stop
            </button>
          ` : `
            <span class="small muted">
              Search for a song or open a playlist to start group playback.
            </span>
          `}

          <button class="secondary" data-action="refresh-group">
            ${svgIcon("refresh", 15)} Refresh
          </button>
        </div>
      ` : `
        <div class="empty">
          You are a group member, but only group admins or authorized users
          can control playback.
        </div>

        <button class="secondary" data-action="refresh-group">
          ${svgIcon("refresh", 15)} Refresh
        </button>
      `}

      <div class="section-head">
        <h2>Up next</h2>
        <span class="small muted">
          ${Number(group.queue_count || 0)} songs
        </span>
      </div>

      <div class="list">
        ${(group.queue || []).map(track => `
          <div class="track-row">
            ${img(track.thumbnail, "track-cover")}

            <div class="grow">
              <div class="track-title">${esc(track.title)}</div>
              <div class="track-sub">${esc(track.artist)}</div>
            </div>
          </div>
        `).join("") || '<div class="small muted">The queue is empty.</div>'}
      </div>
    `;
  }

  async function connectGroup() {
    const input = $("groupIdInput");
    const raw = input?.value.trim() || "";

    if (!/^-100\d{6,13}$/.test(raw)) {
      showToast("Enter a valid supergroup ID starting with -100.");
      return;
    }

    const chatId = Number(raw);

    if (!Number.isSafeInteger(chatId)) {
      showToast("That group ID is outside the supported range.");
      return;
    }

    const panel = $("groupStatusPanel");
    panel.innerHTML =
      '<div class="empty">Checking membership and assistant…</div>';

    try {
      state.selectedGroup = { chat_id: chatId };

      await refreshGroupStatus();

      showToast("Group connected");

      if (state.page === "search" && state.searchMode === "music") {
        await runSearch();
      }

      if (state.page === "home" && state.homeTracks.length) {
        const target = $("homeTracks");

        if (target) {
          target.innerHTML = state.homeTracks.map((track, index) =>
            trackRow(track, index, {
              add: true,
              group: true
            })
          ).join("");
        }
      }

    } catch (error) {
      state.selectedGroup = null;
      state.groupStatus = null;

      panel.innerHTML =
        `<div class="empty group-error">${esc(error.message)}</div>`;

      showToast(error.message);
    }
  }

  async function groupControl(action, payload = {}) {
    if (!state.selectedGroup) {
      throw new Error("Connect a group first.");
    }

    const data = await api(
      `/api/groups/${encodeURIComponent(state.selectedGroup.chat_id)}/control`,
      {
        method: "POST",
        body: JSON.stringify({ action, ...payload })
      }
    );

    if (data.status === "queued") {
      showToast(
        `Added to group queue${
          data.position !== undefined
            ? ` · position ${data.position + 1}`
            : ""
        }`
      );

    } else if (data.status === "playing") {
      showToast("Group playback started");

    } else if (action === "stop") {
      showToast("Group playback stopped");

    } else {
      showToast("Group playback updated");
    }

    await refreshGroupStatus();
  }

  function renderProfile() {
    const profile = state.profile;

    if (!profile) {
      $("page-profile").innerHTML =
        '<div class="empty">Loading profile…</div>';
      return;
    }

    const avatar = profile.avatar_url
      ? `<img class="profile-big-avatar" src="${esc(profile.avatar_url)}" alt="">`
      : `<div class="profile-big-avatar profile-placeholder">${svgIcon("user", 38)}</div>`;

    $("page-profile").innerHTML = `
      <div class="eyebrow">Your account</div>

      <div class="profile-head">
        ${avatar}

        <h1 style="margin:0;font-size:25px">
          ${esc(profile.display_name)}
        </h1>

        <div class="muted" style="margin-top:4px">
          @${esc(profile.handle)}
        </div>

        <p class="muted"
          style="font-size:13px;max-width:420px;margin:12px auto">
          ${esc(profile.bio || "")}
        </p>

        <div class="stat-row">
          <div class="stat">
            <strong>${Number(profile.followers || 0)}</strong>
            <span>Followers</span>
          </div>

          <div class="stat">
            <strong>${Number(profile.following || 0)}</strong>
            <span>Following</span>
          </div>
        </div>

        <button class="secondary" data-action="edit-profile">
          Edit profile
        </button>
      </div>

      <div class="divider"></div>

      <div class="section-head">
        <h2>Your public playlists</h2>
        <button data-page="library">Library</button>
      </div>

      <div id="profilePlaylists" class="grid"></div>

      <div class="section-head">
        <h2>Privacy</h2>
      </div>

      <div class="track-row">
        <div class="grow">
          <div class="track-title">Profile visibility</div>
          <div class="track-sub">${esc(profile.visibility)}</div>
        </div>

        <button class="secondary" data-action="toggle-profile-privacy">
          Change
        </button>
      </div>
    `;

    api("/api/playlists?scope=mine&limit=30")
      .then(data => {
        const target = $("profilePlaylists");
        if (!target) return;

        const publicItems = (data.results || []).filter(
          item => item.visibility === "public"
        );

        target.innerHTML = publicItems.length
          ? publicItems.map(playlistCard).join("")
          : '<div class="empty" style="grid-column:1/-1">No public playlists yet.</div>';
      })
      .catch(() => {});
  }

  async function loadNotifications() {
    const page = $("page-notifications");

    page.innerHTML = `
      <div class="eyebrow">Your activity</div>
      <h1 class="page-title">Notifications</h1>
      <div id="notificationItems" class="list"></div>
    `;

    try {
      const data = await api("/api/notifications?limit=40");
      state.notifications = data.results || [];

      $("notificationItems").innerHTML = state.notifications.length
        ? state.notifications.map(notification => {
            const payload = notification.payload || {};
            const actor = esc(notification.actor?.display_name || "Someone");

            let message = "You have an update.";
            let actions = "";
            let iconName = "bell";

            if (notification.type === "collaboration_invitation") {
              iconName = "users";

              message =
                `${actor} invited you to collaborate on <b>${esc(payload.playlist_name)}</b> as ${esc(payload.role)}.`;

              actions = `
                <button class="primary"
                  data-action="invitation"
                  data-id="${esc(payload.invitation_id)}"
                  data-choice="accept">
                  Accept
                </button>

                <button class="secondary"
                  data-action="invitation"
                  data-id="${esc(payload.invitation_id)}"
                  data-choice="reject">
                  Decline
                </button>
              `;

            } else if (notification.type === "follow_request") {
              iconName = "heart";

              message = `${actor} wants to follow you.`;

              actions = `
                <button class="primary"
                  data-action="follow-response"
                  data-id="${esc(payload.follower_id)}"
                  data-choice="accept">
                  Accept
                </button>

                <button class="secondary"
                  data-action="follow-response"
                  data-id="${esc(payload.follower_id)}"
                  data-choice="reject">
                  Decline
                </button>
              `;

            } else if (notification.type === "new_follower") {
              iconName = "heart";
              message = `${actor} started following you.`;

            } else if (notification.type === "playlist_followed") {
              iconName = "music";
              message =
                `${actor} followed your playlist <b>${esc(payload.playlist_name)}</b>.`;

            } else if (notification.type === "follow_accepted") {
              iconName = "heart";
              message = `${actor} accepted your follow request.`;

            } else if (notification.type === "collaboration_role_changed") {
              iconName = "sparkle";
              message =
                `Your role on <b>${esc(payload.playlist_name)}</b> is now ${esc(payload.role)}.`;

            } else if (notification.type === "collaboration_removed") {
              iconName = "users";
              message =
                `You were removed from <b>${esc(payload.playlist_name)}</b>.`;

            } else if (notification.type.startsWith("collaboration_")) {
              iconName = "users";

              message =
                `${actor} ${esc(
                  notification.type
                    .replace("collaboration_", "collaboration ")
                    .replaceAll("_", " ")
                )} ${esc(payload.playlist_name || "your playlist")}.`;
            }

            return `
              <div class="notification ${notification.read ? "" : "unread"}">
                <div class="notification-icon">
                  ${svgIcon(iconName, 21)}
                </div>

                <div class="grow">
                  <p>${message}</p>

                  <div class="small muted" style="margin-top:6px">
                    ${esc(notification.created_at || "")}
                  </div>

                  ${actions
                    ? `<div class="notification-actions">${actions}</div>`
                    : ""}
                </div>

                <button class="ghost"
                  data-action="read-notification"
                  data-id="${esc(notification.id)}"
                  aria-label="Mark notification read">
                  ${notification.read ? "" : svgIcon("check", 16)}
                </button>
              </div>
            `;
          }).join("")
        : '<div class="empty">You are all caught up.</div>';

    } catch (error) {
      $("notificationItems").innerHTML =
        `<div class="empty">${esc(error.message)}</div>`;
    }
  }

  async function openPlaylist(id) {
    try {
      const data = await api(`/api/playlists/${encodeURIComponent(id)}`);
      state.activePlaylist = data.playlist;
      go("playlist");

    } catch (error) {
      showToast(error.message);
    }
  }

  function renderPlaylist() {
    const playlist = state.activePlaylist;

    if (!playlist) {
      $("page-playlist").innerHTML =
        '<div class="empty">Playlist not found.</div>';
      return;
    }

    const canEdit = ["owner", "editor"].includes(playlist.role);
    const canAdd = ["owner", "editor", "contributor"].includes(playlist.role);
    const isOwner = playlist.role === "owner";
    const tracks = playlist.tracks || [];

    const cover = coverImage(
      playlist.cover_url,
      "detail-cover",
      playlist.icon
    );

    $("page-playlist").innerHTML = `
      <button class="ghost" data-page="library">
        ← Back to library
      </button>

      <div class="detail-head">
        ${cover}

        <div class="grow">
          <div class="eyebrow">
            ${esc(playlist.visibility)} playlist
          </div>

          <div class="detail-name">${esc(playlist.name)}</div>

          <div class="small muted" style="margin-top:7px">
            ${tracks.length} songs
            · by @${esc(playlist.owner?.handle || "listener")}
          </div>

          <div class="small muted" style="margin-top:4px">
            ${svgIcon("heart", 13)}
            ${Number(playlist.like_count || 0)}
            · ${Number(playlist.follower_count || 0)} followers
          </div>
        </div>
      </div>

      <p class="muted small">
        ${esc(playlist.description || "")}
      </p>

      <div class="detail-actions">
        <button class="primary"
          data-action="play-playlist"
          ${tracks.length ? "" : "disabled"}>
          ${svgIcon("play", 15)} Play
        </button>

        <button class="secondary"
          data-action="like-playlist"
          data-id="${esc(playlist.id)}">
          ${playlist.liked
            ? `${svgIcon("heartFill", 15)} Liked`
            : `${svgIcon("heart", 15)} Like`}
        </button>

        ${playlist.owner?.user_id !== state.profile?.user_id ? `
          <button class="secondary"
            data-action="playlist-follow"
            data-id="${esc(playlist.id)}">
            ${playlist.followed ? "Following" : "Follow"}
          </button>
        ` : ""}

        ${canAdd
          ? `<button class="secondary" data-action="add-from-search">
               ${svgIcon("plus", 15)} Add songs
             </button>`
          : ""}

        ${state.selectedGroup ? `
          <button class="secondary" data-action="group-play-playlist">
            ${svgIcon("users", 15)} Play in group
          </button>

          <button class="secondary" data-action="group-queue-playlist">
            ${svgIcon("plus", 15)} Queue in group
          </button>
        ` : ""}

        ${canEdit
          ? '<button class="secondary" data-action="edit-playlist">Edit</button>'
          : ""}

        ${isOwner ? `
          <button class="secondary" data-action="invite-collaborator">
            ${svgIcon("users", 15)} Invite
          </button>

          <button class="danger" data-action="delete-playlist">
            Delete
          </button>
        ` : ""}
      </div>

      <div class="section-head">
        <h2>Tracks</h2>
        <span class="small muted">${tracks.length} songs</span>
      </div>

      <div id="playlistTracks" class="list">
        ${tracks.length
          ? tracks.map((track, index) => trackRow(track, index, {
              draggable: canEdit,
              reorder: canEdit,
              remove: canEdit,
              group: Boolean(state.selectedGroup)
            })).join("")
          : '<div class="empty">This playlist is empty. Add a song whenever you like.</div>'}
      </div>

      ${isOwner ? `
        <div class="section-head">
          <h2>Collaborators</h2>
        </div>

        <div class="list">
          ${(playlist.collaborators || []).map(collaborator => `
            <div class="person-row">
              <div class="grow">
                <div class="track-title">
                  ${esc(collaborator.display_name || collaborator.handle || "Listener")}
                </div>

                <div class="track-sub">
                  @${esc(collaborator.handle || "unknown")}
                  · ${esc(collaborator.role)}
                </div>
              </div>

              <button class="track-action"
                data-action="remove-collaborator"
                data-id="${esc(collaborator.user_id)}"
                title="Remove collaborator">
                ${svgIcon("close", 17)}
              </button>

              <button class="track-action"
                data-action="change-collaborator"
                data-id="${esc(collaborator.user_id)}"
                title="Change role">
                ${svgIcon("users", 17)}
              </button>
            </div>
          `).join("") || '<div class="small muted">No collaborators yet.</div>'}
        </div>
      ` : ""}
    `;
  }

  async function reloadActivePlaylist() {
    if (!state.activePlaylist) return;

    const data = await api(
      `/api/playlists/${encodeURIComponent(state.activePlaylist.id)}`
    );

    state.activePlaylist = data.playlist;
    renderPlaylist();
  }

  function openSheet(title, body, actions) {
    $("sheetTitle").textContent = title;
    $("sheetBody").innerHTML = body;
    $("sheetActions").innerHTML = actions;
    $("sheetOverlay").classList.add("open");
  }

  function closeSheet() {
    $("sheetOverlay").classList.remove("open");
    state.selectedInvite = null;
    state.modalTrack = null;
  }

  function createPlaylistSheet() {
    openSheet(
      "Create playlist",
      `
        <div class="field">
          <label>PLAYLIST NAME</label>
          <input id="newPlaylistName"
            maxlength="80"
            placeholder="Give it a name">
        </div>

        <div class="field">
          <label>DESCRIPTION</label>
          <textarea id="newPlaylistDescription"
            maxlength="500"
            placeholder="What is this playlist about?"></textarea>
        </div>

        <div class="field">
          <label>PLAYLIST ICON</label>
          <select id="newPlaylistIcon">
            <option value="music">Music</option>
            <option value="heart">Heart</option>
            <option value="chill">Chill</option>
            <option value="star">Star</option>
            <option value="headphones">Headphones</option>
            <option value="group">Group</option>
          </select>
        </div>

        <div class="field">
          <label>VISIBILITY</label>
          <select id="newPlaylistVisibility">
            <option value="private">Private</option>
            <option value="public">Public</option>
            <option value="unlisted">Unlisted · link only</option>
          </select>
        </div>

        <div class="field">
          <label>PLAYLIST COVER</label>

          <div class="upload-row">
            <input id="newPlaylistCoverFile"
              type="file"
              accept="image/jpeg,image/png,image/webp">

            <button class="secondary"
              data-action="upload-cover"
              data-file="newPlaylistCoverFile"
              data-target="newPlaylistCover">
              ${svgIcon("upload", 15)} Upload
            </button>
          </div>

          <div class="upload-help">
            Upload JPG, PNG or WebP to Catbox. Maximum 5 MB.
          </div>

          <input id="newPlaylistCover"
            type="url"
            maxlength="2048"
            placeholder="Or paste an HTTPS image URL">
        </div>
      `,
      `
        <button class="secondary" data-action="close-sheet">
          Cancel
        </button>

        <button class="primary" data-action="save-playlist">
          Create playlist
        </button>
      `
    );
  }

  function editPlaylistSheet() {
    const playlist = state.activePlaylist;

    openSheet(
      "Edit playlist",
      `
        <div class="field">
          <label>NAME</label>
          <input id="editPlaylistName"
            maxlength="80"
            value="${esc(playlist.name)}">
        </div>

        <div class="field">
          <label>DESCRIPTION</label>
          <textarea id="editPlaylistDescription"
            maxlength="500">${esc(playlist.description || "")}</textarea>
        </div>

        <div class="field">
          <label>PLAYLIST ICON</label>
          <select id="editPlaylistIcon">
            <option value="music" ${playlist.icon === "music" ? "selected" : ""}>Music</option>
            <option value="heart" ${playlist.icon === "heart" ? "selected" : ""}>Heart</option>
            <option value="chill" ${playlist.icon === "chill" ? "selected" : ""}>Chill</option>
            <option value="star" ${playlist.icon === "star" ? "selected" : ""}>Star</option>
            <option value="headphones" ${playlist.icon === "headphones" ? "selected" : ""}>Headphones</option>
            <option value="group" ${playlist.icon === "group" ? "selected" : ""}>Group</option>
          </select>
        </div>

        <div class="field">
          <label>PLAYLIST COVER</label>

          <div class="upload-row">
            <input id="editPlaylistCoverFile"
              type="file"
              accept="image/jpeg,image/png,image/webp">

            <button class="secondary"
              data-action="upload-cover"
              data-file="editPlaylistCoverFile"
              data-target="editPlaylistCover">
              ${svgIcon("upload", 15)} Upload
            </button>
          </div>

          <div class="upload-help">
            Upload JPG, PNG or WebP to Catbox. Maximum 5 MB.
          </div>

          <input id="editPlaylistCover"
            type="url"
            maxlength="2048"
            value="${esc(playlist.cover_url || "")}"
            placeholder="Or paste an HTTPS image URL">
        </div>

        ${playlist.role === "owner" ? `
          <div class="field">
            <label>VISIBILITY</label>
            <select id="editPlaylistVisibility">
              <option value="private" ${playlist.visibility === "private" ? "selected" : ""}>Private</option>
              <option value="public" ${playlist.visibility === "public" ? "selected" : ""}>Public</option>
              <option value="unlisted" ${playlist.visibility === "unlisted" ? "selected" : ""}>Unlisted</option>
            </select>
          </div>
        ` : ""}
      `,
      `
        <button class="secondary" data-action="close-sheet">
          Cancel
        </button>

        <button class="primary" data-action="save-playlist-edit">
          Save changes
        </button>
      `
    );
  }

  function addTrackSheet(track) {
    state.modalTrack = track;

    const options = state.playlists.map(playlist =>
      `<option value="${esc(playlist.id)}">${esc(playlist.name)}</option>`
    ).join("");

    openSheet(
      "Add to playlist",
      `
        <div class="track-row">
          ${img(track.thumbnail, "track-cover")}

          <div class="grow">
            <div class="track-title">${esc(track.title)}</div>
            <div class="track-sub">${esc(track.artist || "Unknown artist")}</div>
          </div>
        </div>

        <div class="field">
          <label>CHOOSE PLAYLIST</label>

          <select id="targetPlaylist">
            ${options || '<option value="">No playlists</option>'}
          </select>
        </div>
      `,
      `
        <button class="secondary" data-action="close-sheet">
          Cancel
        </button>

        <button class="primary"
          data-action="confirm-add-track"
          ${options ? "" : "disabled"}>
          Add song
        </button>
      `
    );
  }

  async function inviteSheet() {
    if (!state.playlists.length) {
      const data = await api("/api/playlists?scope=mine&limit=50");
      state.playlists = data.results || [];
    }

    openSheet(
      "Invite collaborator",
      `
        <div class="field">
          <label>SEARCH PEOPLE</label>
          <input id="inviteSearch"
            placeholder="Search by name or username"
            maxlength="64">
        </div>

        <div id="invitePeople" class="list"></div>

        <div class="field">
          <label>ROLE</label>
          <select id="inviteRole">
            <option value="editor">Editor · add, remove, reorder</option>
            <option value="contributor">Contributor · add songs</option>
            <option value="viewer">Viewer · view and play</option>
          </select>
        </div>

        <div class="field">
          <label>PLAYLIST</label>
          <select id="invitePlaylist">
            <option value="${esc(state.activePlaylist.id)}">
              ${esc(state.activePlaylist.name)}
            </option>
          </select>
        </div>
      `,
      `
        <button class="secondary" data-action="close-sheet">
          Cancel
        </button>

        <button class="primary"
          data-action="send-invite"
          disabled
          id="sendInviteButton">
          Send invite
        </button>
      `
    );

    $("inviteSearch").addEventListener("input", () => {
      clearTimeout(inviteSheet.timer);
      inviteSheet.timer = setTimeout(searchInvitePeople, 260);
    });
  }

  async function searchInvitePeople() {
    const input = $("inviteSearch");
    if (!input) return;

    const query = input.value.trim();
    const target = $("invitePeople");
    const send = $("sendInviteButton");

    if (query.length < 2) {
      target.innerHTML =
        '<div class="small muted">Type at least two characters.</div>';
      return;
    }

    try {
      const data = await api(
        `/api/search/people?q=${encodeURIComponent(query)}&limit=10`
      );

      state.modalPeople = data.results || [];

      target.innerHTML = state.modalPeople.map(person => `
        <button class="person-row"
          style="width:100%;text-align:left;background:transparent"
          data-action="select-invitee"
          data-id="${esc(person.user_id)}">

          ${img(person.avatar_url, "person-avatar")}

          <span class="grow">
            <b>${esc(person.display_name)}</b>
            <span class="track-sub">@${esc(person.handle)}</span>
          </span>

          <span>
            ${state.selectedInvite === person.user_id
              ? svgIcon("check", 17)
              : svgIcon("plus", 17)}
          </span>
        </button>
      `).join("") || '<div class="small muted">No matching people.</div>';

      if (send) {
        send.disabled = !state.selectedInvite;
      }

    } catch (error) {
      showToast(error.message);
    }
  }

  function editProfileSheet() {
    const profile = state.profile;

    openSheet(
      "Edit profile",
      `
        <div class="field">
          <label>USERNAME</label>
          <input id="profileHandle"
            maxlength="24"
            value="${esc(profile.handle)}">
        </div>

        <div class="field">
          <label>DISPLAY NAME</label>
          <input id="profileName"
            maxlength="48"
            value="${esc(profile.display_name)}">
        </div>

        <div class="field">
          <label>BIO</label>
          <textarea id="profileBio"
            maxlength="160">${esc(profile.bio || "")}</textarea>
        </div>

        <div class="field">
          <label>PROFILE IMAGE</label>

          <div class="upload-row">
            <input id="profileAvatarFile"
              type="file"
              accept="image/jpeg,image/png,image/webp">

            <button class="secondary"
              data-action="upload-cover"
              data-file="profileAvatarFile"
              data-target="profileAvatar">
              ${svgIcon("upload", 15)} Upload
            </button>
          </div>

          <div class="upload-help">
            Upload JPG, PNG or WebP to Catbox. Maximum 5 MB.
          </div>

          <input id="profileAvatar"
            type="url"
            maxlength="2048"
            value="${esc(profile.avatar_url || "")}"
            placeholder="Or paste an HTTPS image URL">
        </div>

        <div class="field">
          <label>PROFILE VISIBILITY</label>
          <select id="profileVisibility">
            <option value="public" ${profile.visibility === "public" ? "selected" : ""}>Public</option>
            <option value="private" ${profile.visibility === "private" ? "selected" : ""}>Private</option>
          </select>
        </div>

        <div class="field">
          <label>SEARCH DISCOVERY</label>
          <select id="profileDiscoverable">
            <option value="true" ${profile.discoverable !== false ? "selected" : ""}>
              Allow people to find me
            </option>

            <option value="false" ${profile.discoverable === false ? "selected" : ""}>
              Hide me from people search
            </option>
          </select>
        </div>
      `,
      `
        <button class="secondary" data-action="close-sheet">
          Cancel
        </button>

        <button class="primary" data-action="save-profile">
          Save changes
        </button>
      `
    );
  }

  async function uploadCover(fileInputId, targetInputId, button) {
    const input = $(fileInputId);
    const target = $(targetInputId);
    const file = input?.files?.[0];

    if (!file || !target) {
      throw new Error("Choose an image first.");
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!allowedTypes.includes(file.type)) {
      throw new Error("Use a JPG, PNG or WebP image.");
    }

    if (file.size <= 0) {
      throw new Error("The selected image is empty.");
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new Error("Image must be 5 MB or smaller.");
    }

    const form = new FormData();
    form.append("fileToUpload", file, file.name);

    const originalText = button?.innerHTML || "";

    if (button) {
      button.disabled = true;
      button.innerHTML = `${svgIcon("refresh", 15)} Uploading…`;
    }

    try {
      const result = await api("/api/upload/cover", {
        method: "POST",
        body: form
      });

      if (!result.url) {
        throw new Error("Catbox did not return an image URL.");
      }

      target.value = result.url;
      showToast("Image uploaded to Catbox");

    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = originalText;
      }
    }
  }

  async function openPerson(handle) {
    try {
      const data = await api(
        `/api/people/${encodeURIComponent(handle)}`
      );

      state.activePerson = data;

      const person = data.profile;

      const personAvatar = person.avatar_url
        ? img(person.avatar_url, "profile-big-avatar")
        : `<div class="profile-big-avatar profile-placeholder">${svgIcon("user", 38)}</div>`;

      $("page-person").innerHTML = `
        <button class="ghost" data-page="search">
          ← Back
        </button>

        <div class="profile-head">
          ${personAvatar}

          <h1 style="margin:0;font-size:25px">
            ${esc(person.display_name)}
          </h1>

          <div class="muted" style="margin-top:4px">
            @${esc(person.handle)}
          </div>

          <p class="muted small">${esc(person.bio || "")}</p>

          <div class="stat-row">
            <div class="stat">
              <strong>${Number(person.followers || 0)}</strong>
              <span>Followers</span>
            </div>

            <div class="stat">
              <strong>${Number(person.following || 0)}</strong>
              <span>Following</span>
            </div>
          </div>

          ${person.is_self ? "" : `
            <button class="primary"
              data-action="follow-person"
              data-id="${esc(person.user_id)}">
              ${person.follow_state === "accepted"
                ? "Following"
                : person.follow_state === "pending"
                  ? "Requested"
                  : "Follow"}
            </button>
          `}
        </div>

        <div class="section-head">
          <h2>Public playlists</h2>
        </div>

        <div class="grid">
          ${(data.playlists || []).map(playlistCard).join("") ||
            '<div class="empty" style="grid-column:1/-1">No public playlists.</div>'}
        </div>
      `;

      go("person");

    } catch (error) {
      showToast(error.message);
    }
  }

  function openQueue() {
    $("queueCaption").textContent = state.currentTrack
      ? `Playing ${state.currentTrack.title}`
      : "Nothing playing";

    $("queueItems").innerHTML = state.queue.length
      ? state.queue.map((track, index) => `
          <div class="track-row">
            ${img(track.thumbnail, "track-cover")}

            <div class="grow">
              <div class="track-title">
                ${index === state.queueIndex
                  ? `${svgIcon("play", 12)} `
                  : ""}
                ${esc(track.title)}
              </div>

              <div class="track-sub">
                ${esc(track.artist || "")}
              </div>
            </div>

            <button class="track-action"
              data-action="queue-play"
              data-index="${index}"
              title="Play">
              ${svgIcon("play", 16)}
            </button>

            <button class="track-action remove-track"
              data-action="queue-remove"
              data-index="${index}"
              title="Remove">
              ${svgIcon("trash", 16)}
            </button>
          </div>
        `).join("")
      : '<div class="empty">Queue is empty.</div>';

    $("queueOverlay").classList.add("open");
  }

  function updatePlayer() {
    const track = state.currentTrack;

    if (!track) {
      $("miniPlayer").classList.remove("visible");
      $("miniToggle").innerHTML = svgIcon("play", 18);
      $("fullToggle").innerHTML = svgIcon("play", 26);
      return;
    }

    $("miniPlayer").classList.add("visible");

    $("miniCover").src = track.thumbnail || "";
    $("miniTitle").textContent = track.title || "Unknown track";
    $("miniArtist").textContent = track.artist || "Unknown artist";

    $("miniToggle").innerHTML =
      audio.paused ? svgIcon("play", 18) : svgIcon("pause", 18);

    $("fullToggle").innerHTML =
      audio.paused ? svgIcon("play", 26) : svgIcon("pause", 26);

    $("fullCover").src = track.thumbnail || "";
    $("fullTitle").textContent = track.title || "Unknown track";
    $("fullArtist").textContent = track.artist || "Unknown artist";
  }

  function waitForMetadata() {
    if (audio.readyState >= 1) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      let timer;

      const cleanup = () => {
        clearTimeout(timer);
        audio.removeEventListener("loadedmetadata", onLoaded);
        audio.removeEventListener("error", onError);
      };

      const onLoaded = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(new Error("Audio metadata could not load."));
      };

      audio.addEventListener("loadedmetadata", onLoaded, { once: true });
      audio.addEventListener("error", onError, { once: true });

      timer = setTimeout(() => {
        cleanup();
        reject(new Error("Audio source took too long to load."));
      }, 15000);
    });
  }

  async function playTrack(track, list = null, index = 0, resumeAt = 0) {
    if (!track) return;

    const requestId = ++state.playbackRequest;
    const nextQueue = Array.isArray(list) ? list.slice() : [track];

    const safeIndex = Math.max(
      0,
      Math.min(
        Number(index) || 0,
        Math.max(0, nextQueue.length - 1)
      )
    );

    state.queue = nextQueue;
    state.queueIndex = safeIndex;
    state.currentTrack = { ...track };

    audio.pause();
    updatePlayer();

    try {
      const token = await api("/api/stream-token", {
        method: "POST",
        body: JSON.stringify({ video_id: track.id })
      });

      if (requestId !== state.playbackRequest) return;

      audio.src = token.stream_url;
      audio.load();

      if (resumeAt > 0) {
        await waitForMetadata();

        if (requestId !== state.playbackRequest) return;

        const duration = Number(audio.duration);

        audio.currentTime =
          Number.isFinite(duration) && duration > 0
            ? Math.min(resumeAt, Math.max(0, duration - .25))
            : resumeAt;
      }

      if (requestId !== state.playbackRequest) return;

      await audio.play();

      if (requestId !== state.playbackRequest) {
        audio.pause();
        return;
      }

      state.currentTrack = {
        ...track,
        stream_url: token.stream_url
      };

      state.queue[state.queueIndex] = state.currentTrack;

      updatePlayer();
      setMediaSession();

    } catch (error) {
      if (requestId !== state.playbackRequest) return;
      if (error?.name === "AbortError") return;

      console.error("Taalune playback failed:", error);
      showToast(error.message || "Unable to start this song.");
      updatePlayer();
    }
  }

  function setMediaSession() {
    if (!("mediaSession" in navigator) || !state.currentTrack) {
      return;
    }

    const track = state.currentTrack;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || "Unknown track",
        artist: track.artist || "Unknown artist",
        album: "Taalune",
        artwork: track.thumbnail
          ? [{
              src: track.thumbnail,
              sizes: "512x512",
              type: "image/jpeg"
            }]
          : []
      });

      navigator.mediaSession.setActionHandler("play", togglePlay);

      navigator.mediaSession.setActionHandler("pause", () => {
        audio.pause();
        updatePlayer();
      });

      navigator.mediaSession.setActionHandler("nexttrack", nextTrack);
      navigator.mediaSession.setActionHandler("previoustrack", previousTrack);

    } catch (_) {}
  }

  async function togglePlay() {
    if (!state.currentTrack) return;

    if (!audio.paused) {
      audio.pause();
      updatePlayer();
      return;
    }

    if (!audio.src) {
      await playTrack(
        state.currentTrack,
        state.queue,
        state.queueIndex
      );
      return;
    }

    const requestId = state.playbackRequest;

    try {
      await audio.play();

      if (requestId !== state.playbackRequest) return;

      updatePlayer();
      setMediaSession();

    } catch (error) {
      if (requestId !== state.playbackRequest) return;
      if (error?.name === "AbortError") return;

      const position = Number(audio.currentTime) || 0;

      await playTrack(
        state.currentTrack,
        state.queue,
        state.queueIndex,
        position
      );
    }
  }

  async function nextTrack() {
    if (!state.queue.length) return;

    if (state.shuffle && state.queue.length > 1) {
      let nextIndex = state.queueIndex;

      while (nextIndex === state.queueIndex) {
        nextIndex = Math.floor(Math.random() * state.queue.length);
      }

      state.queueIndex = nextIndex;

    } else if (state.queueIndex + 1 < state.queue.length) {
      state.queueIndex++;

    } else if (state.repeat && state.currentTrack) {
      await playTrack(
        state.currentTrack,
        state.queue,
        state.queueIndex
      );
      return;

    } else {
      state.playbackRequest++;

      audio.pause();
      audio.removeAttribute("src");
      audio.load();

      state.currentTrack = null;
      state.queue = [];
      state.queueIndex = -1;

      updatePlayer();
      return;
    }

    await playTrack(
      state.queue[state.queueIndex],
      state.queue,
      state.queueIndex
    );
  }

  async function previousTrack() {
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    if (state.queueIndex > 0) {
      state.queueIndex--;

      await playTrack(
        state.queue[state.queueIndex],
        state.queue,
        state.queueIndex
      );
    }
  }

  async function reorderPlaylist(trackId, direction) {
    const playlist = state.activePlaylist;

    if (!playlist) {
      throw new Error("Playlist is not open.");
    }

    const tracks = playlist.tracks.slice();

    const from = tracks.findIndex(
      track => String(track.id) === String(trackId)
    );

    const to = from + direction;

    if (from < 0 || to < 0 || to >= tracks.length) {
      return;
    }

    [tracks[from], tracks[to]] = [tracks[to], tracks[from]];

    const result = await api(
      `/api/playlists/${encodeURIComponent(playlist.id)}/tracks/order`,
      {
        method: "PUT",
        body: JSON.stringify({
          track_ids: tracks.map(track => track.id),
          version: playlist.version
        })
      }
    );

    state.activePlaylist = result.playlist;
    renderPlaylist();
    showToast("Playlist order updated");
  }

  document.addEventListener("click", async event => {
    const pageButton = event.target.closest("[data-page]");

    if (pageButton) {
      go(pageButton.dataset.page);
      return;
    }

    const homeQueryButton = event.target.closest("[data-home-query]");

    if (homeQueryButton) {
      await loadHomeTracks(
        homeQueryButton.dataset.homeQuery,
        true
      );
      return;
    }

    const modeButton = event.target.closest("[data-search-mode]");

    if (modeButton) {
      setSearchMode(modeButton.dataset.searchMode);
      return;
    }

    const scopeButton = event.target.closest("[data-library-scope]");

    if (scopeButton) {
      await showLibraryScope(scopeButton.dataset.libraryScope);
      return;
    }

    const button = event.target.closest("[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;

    try {
      if (action === "notifications") {
        go("notifications");

      } else if (action === "profile") {
        go("profile");

      } else if (action === "create-playlist") {
        createPlaylistSheet();

      } else if (action === "refresh-home") {
        await loadHomeTracks(state.homeQuery, true);

      } else if (action === "close-sheet") {
        closeSheet();

      } else if (action === "close-queue") {
        $("queueOverlay").classList.remove("open");

      } else if (action === "open-playlist") {
        await openPlaylist(id);

      } else if (action === "open-person") {
        await openPerson(button.dataset.handle);

      } else if (action === "check-group") {
        await connectGroup();

      } else if (action === "refresh-group") {
        await refreshGroupStatus();
        showToast("Group status updated");

      } else if (action === "group-control") {
        await groupControl(button.dataset.command);

      } else if (action === "group-track") {
        const track = [
          ...state.searchResults,
          ...state.homeTracks,
          ...(state.activePlaylist?.tracks || []),
          ...state.liked
        ].find(item => String(item.id) === String(id));

        if (!track) {
          throw new Error("Song details are unavailable. Search again.");
        }

        await groupControl("queue_track", {
          track: {
            id: track.id,
            title: track.title,
            artist: track.artist || "Unknown artist",
            duration_sec: Number(track.duration_sec || 0),
            thumbnail: track.thumbnail || null
          }
        });

      } else if (action === "group-play-playlist") {
        if (!state.activePlaylist) {
          throw new Error("Open a playlist first.");
        }

        await groupControl("play_playlist", {
          playlist_id: state.activePlaylist.id
        });

      } else if (action === "group-queue-playlist") {
        if (!state.activePlaylist) {
          throw new Error("Open a playlist first.");
        }

        await groupControl("queue_playlist", {
          playlist_id: state.activePlaylist.id
        });

      } else if (action === "play-track") {
        const list = state.page === "playlist"
          ? (state.activePlaylist?.tracks || [])
          : state.page === "library" && state.libraryScope === "liked"
            ? state.liked
            : state.page === "home"
              ? state.homeTracks
              : state.searchResults;

        const track = list.find(
          item => String(item.id) === String(id)
        ) || [
          ...state.searchResults,
          ...state.homeTracks,
          ...state.liked,
          ...(state.activePlaylist?.tracks || [])
        ].find(item => String(item.id) === String(id));

        if (track) {
          const playbackList = list.some(
            item => String(item.id) === String(track.id)
          ) ? list : [track];

          const index = playbackList.findIndex(
            item => String(item.id) === String(track.id)
          );

          await playTrack(
            track,
            playbackList,
            Math.max(0, index)
          );
        }

      } else if (action === "add-track") {
        const track = [
          ...state.searchResults,
          ...state.homeTracks,
          ...state.liked,
          ...(state.activePlaylist?.tracks || [])
        ].find(item => String(item.id) === String(id));

        if (!track) {
          throw new Error("Song details are unavailable. Search again.");
        }

        if (state.addTargetPlaylist) {
          const playlistId = state.addTargetPlaylist;

          await api(
            `/api/playlists/${encodeURIComponent(playlistId)}/tracks`,
            {
              method: "POST",
              body: JSON.stringify({
                id: track.id,
                title: track.title,
                artist: track.artist || "Unknown artist",
                duration_sec: Number(track.duration_sec || 0),
                thumbnail: track.thumbnail || null
              })
            }
          );

          state.addTargetPlaylist = null;

          showToast("Song added to playlist");

          if (state.activePlaylist?.id === playlistId) {
            await reloadActivePlaylist();
          }

        } else {
          const data = await api(
            "/api/playlists?scope=mine&limit=50"
          );

          state.playlists = data.results || [];
          addTrackSheet(track);
        }

      } else if (action === "like-track") {
        const track = [
          ...state.searchResults,
          ...state.homeTracks,
          ...state.liked,
          ...(state.activePlaylist?.tracks || [])
        ].find(item => String(item.id) === String(id))
          || state.currentTrack;

        if (!track) {
          throw new Error("Song details are unavailable.");
        }

        if (
          state.page === "library" &&
          state.libraryScope === "liked"
        ) {
          await api(
            `/api/tracks/${encodeURIComponent(id)}/like`,
            { method: "DELETE" }
          );

          await showLibraryScope("liked");
          showToast("Removed from Liked Songs");

        } else {
          await api(
            `/api/tracks/${encodeURIComponent(id)}/like`,
            {
              method: "POST",
              body: JSON.stringify(track)
            }
          );

          button.innerHTML = svgIcon("heartFill", 18);
          showToast("Added to Liked Songs");
        }

      } else if (action === "playlist-follow") {
        const data = await api(
          `/api/playlists/${encodeURIComponent(id)}`
        );

        const playlist = data.playlist;
        const method = playlist.followed ? "DELETE" : "POST";

        await api(
          `/api/playlists/${encodeURIComponent(id)}/follow`,
          { method }
        );

        showToast(
          playlist.followed
            ? "Playlist unfollowed"
            : "Playlist followed"
        );

        if (state.activePlaylist?.id === id) {
          await reloadActivePlaylist();

        } else if (state.page === "home") {
          await loadHome();

        } else if (state.page === "library") {
          await showLibraryScope(state.libraryScope);
        }

      } else if (action === "like-playlist") {
        const playlist = state.activePlaylist;

        if (!playlist) {
          throw new Error("Playlist is not open.");
        }

        await api(
          `/api/playlists/${encodeURIComponent(playlist.id)}/like`,
          {
            method: playlist.liked ? "DELETE" : "POST"
          }
        );

        await reloadActivePlaylist();

      } else if (action === "play-playlist") {
        const playlist = state.activePlaylist;

        if (!playlist?.tracks?.length) {
          throw new Error("This playlist is empty.");
        }

        await playTrack(
          playlist.tracks[0],
          playlist.tracks,
          0
        );

      } else if (action === "edit-playlist") {
        editPlaylistSheet();

      } else if (action === "save-playlist-edit") {
        const playlist = state.activePlaylist;

        const body = {
          name: $("editPlaylistName").value,
          description: $("editPlaylistDescription").value,
          cover_url: $("editPlaylistCover").value || null,
          icon: $("editPlaylistIcon").value || "music"
        };

        const visibility = $("editPlaylistVisibility");

        if (visibility) {
          body.visibility = visibility.value;
        }

        const result = await api(
          `/api/playlists/${encodeURIComponent(playlist.id)}`,
          {
            method: "PATCH",
            body: JSON.stringify(body)
          }
        );

        state.activePlaylist = result.playlist;

        closeSheet();
        renderPlaylist();
        showToast("Playlist updated");

      } else if (action === "save-playlist") {
        const body = {
          name: $("newPlaylistName").value,
          description: $("newPlaylistDescription").value,
          visibility: $("newPlaylistVisibility").value,
          cover_url: $("newPlaylistCover").value || null,
          icon: $("newPlaylistIcon").value || "music"
        };

        const result = await api("/api/playlists", {
          method: "POST",
          body: JSON.stringify(body)
        });

        closeSheet();
        showToast("Playlist created");

        await openPlaylist(result.playlist.id);

      } else if (action === "confirm-add-track") {
        const playlistId = $("targetPlaylist").value;

        if (!playlistId || !state.modalTrack) {
          throw new Error("Choose a playlist first.");
        }

        await api(
          `/api/playlists/${encodeURIComponent(playlistId)}/tracks`,
          {
            method: "POST",
            body: JSON.stringify(state.modalTrack)
          }
        );

        closeSheet();
        showToast("Song added to playlist");

        if (state.activePlaylist?.id === playlistId) {
          await reloadActivePlaylist();
        }

      } else if (action === "add-from-search") {
        state.addTargetPlaylist = state.activePlaylist?.id || null;
        state.searchMode = "music";

        go("search");

        showToast("Search for a song, then tap Add to playlist.");

      } else if (action === "upload-cover") {
        await uploadCover(
          button.dataset.file,
          button.dataset.target,
          button
        );

      } else if (action === "invite-collaborator") {
        await inviteSheet();

      } else if (action === "delete-playlist") {
        if (!state.activePlaylist) return;

        if (!confirm("Delete this playlist? It will be hidden from everyone.")) {
          return;
        }

        await api(
          `/api/playlists/${encodeURIComponent(state.activePlaylist.id)}`,
          { method: "DELETE" }
        );

        state.activePlaylist = null;

        showToast("Playlist deleted");
        go("library");

      } else if (action === "select-invitee") {
        state.selectedInvite = Number(id);

        const send = $("sendInviteButton");

        if (send) {
          send.disabled = false;
        }

        await searchInvitePeople();

      } else if (action === "send-invite") {
        if (!state.selectedInvite) {
          throw new Error("Choose a person first.");
        }

        const playlistId = $("invitePlaylist").value;

        await api(
          `/api/playlists/${encodeURIComponent(playlistId)}/invitations`,
          {
            method: "POST",
            body: JSON.stringify({
              user_id: state.selectedInvite,
              role: $("inviteRole").value
            })
          }
        );

        closeSheet();
        showToast("Collaboration invitation sent");

      } else if (action === "invitation") {
        await api(
          `/api/invitations/${encodeURIComponent(id)}/respond`,
          {
            method: "POST",
            body: JSON.stringify({
              action: button.dataset.choice
            })
          }
        );

        showToast(
          button.dataset.choice === "accept"
            ? "Invitation accepted"
            : "Invitation declined"
        );

        await loadNotifications();

      } else if (action === "follow-response") {
        await api(
          `/api/people/${encodeURIComponent(id)}/follow-response`,
          {
            method: "POST",
            body: JSON.stringify({
              action: button.dataset.choice
            })
          }
        );

        showToast("Follow request updated");
        await loadNotifications();

      } else if (action === "follow-person") {
        const result = await api(
          `/api/people/${encodeURIComponent(id)}/follow`,
          { method: "POST" }
        );

        button.textContent = result.status === "pending"
          ? "Requested"
          : "Following";

        showToast(
          result.status === "pending"
            ? "Follow request sent"
            : "Following"
        );

      } else if (action === "read-notification") {
        await api(
          `/api/notifications/${encodeURIComponent(id)}/read`,
          { method: "POST" }
        );

        button.innerHTML = svgIcon("check", 16);
        button.closest(".notification")?.classList.remove("unread");

      } else if (action === "edit-profile") {
        editProfileSheet();

      } else if (action === "save-profile") {
        const body = {
          handle: $("profileHandle").value,
          display_name: $("profileName").value,
          bio: $("profileBio").value,
          avatar_url: $("profileAvatar").value || null,
          visibility: $("profileVisibility").value,
          discoverable: $("profileDiscoverable").value === "true"
        };

        const result = await api("/api/profile", {
          method: "PATCH",
          body: JSON.stringify(body)
        });

        state.profile = result.profile;

        setAvatar();
        closeSheet();
        renderProfile();

        showToast("Profile updated");

      } else if (action === "toggle-profile-privacy") {
        const visibility = state.profile.visibility === "public"
          ? "private"
          : "public";

        const result = await api("/api/profile", {
          method: "PATCH",
          body: JSON.stringify({ visibility })
        });

        state.profile = result.profile;

        renderProfile();
        showToast("Profile privacy updated");

      } else if (action === "remove-track") {
        const playlist = state.activePlaylist;

        if (!playlist) {
          throw new Error("Playlist is not open.");
        }

        if (!confirm("Remove this song from the playlist?")) {
          return;
        }

        await api(
          `/api/playlists/${encodeURIComponent(playlist.id)}/tracks/${encodeURIComponent(id)}`,
          { method: "DELETE" }
        );

        await reloadActivePlaylist();
        showToast("Song removed from playlist");

      } else if (
        action === "move-track-up" ||
        action === "move-track-down"
      ) {
        await reorderPlaylist(
          id,
          action === "move-track-up" ? -1 : 1
        );

      } else if (action === "remove-collaborator") {
        if (!state.activePlaylist) return;

        if (!confirm("Remove this collaborator from the playlist?")) {
          return;
        }

        await api(
          `/api/playlists/${encodeURIComponent(state.activePlaylist.id)}/collaborators/${encodeURIComponent(id)}`,
          { method: "DELETE" }
        );

        await reloadActivePlaylist();
        showToast("Collaborator removed");

      } else if (action === "change-collaborator") {
        if (!state.activePlaylist) return;

        const role = prompt(
          "New role: editor, contributor or viewer",
          "editor"
        );

        if (!role) return;

        if (!["editor", "contributor", "viewer"].includes(role)) {
          throw new Error("Choose editor, contributor or viewer.");
        }

        await api(
          `/api/playlists/${encodeURIComponent(state.activePlaylist.id)}/collaborators/${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            body: JSON.stringify({ role })
          }
        );

        await reloadActivePlaylist();
        showToast("Collaborator role updated");

      } else if (action === "open-player") {
        $("fullPlayer").classList.add("open");

      } else if (action === "close-player") {
        $("fullPlayer").classList.remove("open");

      } else if (action === "toggle-play") {
        await togglePlay();

      } else if (action === "next-track") {
        await nextTrack();

      } else if (action === "previous-track") {
        await previousTrack();

      } else if (action === "shuffle") {
        state.shuffle = !state.shuffle;

        button.classList.toggle("active", state.shuffle);
        button.style.color = state.shuffle ? "var(--accent)" : "";

      } else if (action === "repeat") {
        state.repeat = !state.repeat;

        button.classList.toggle("active", state.repeat);
        button.style.color = state.repeat ? "var(--accent)" : "";

      } else if (action === "queue") {
        openQueue();

      } else if (action === "queue-play") {
        const index = Number(button.dataset.index);

        if (!state.queue[index]) return;

        await playTrack(
          state.queue[index],
          state.queue,
          index
        );

        $("queueOverlay").classList.remove("open");

      } else if (action === "queue-remove") {
        const index = Number(button.dataset.index);

        if (!Number.isInteger(index) || !state.queue[index]) {
          return;
        }

        if (index === state.queueIndex) {
          if (state.queue.length === 1) {
            state.playbackRequest++;

            audio.pause();
            audio.removeAttribute("src");
            audio.load();

            state.queue = [];
            state.queueIndex = -1;
            state.currentTrack = null;

            updatePlayer();

          } else {
            const nextIndex = index < state.queue.length - 1
              ? index + 1
              : index - 1;

            const next = state.queue[nextIndex];

            state.queue.splice(index, 1);

            state.queueIndex =
              nextIndex > index ? nextIndex - 1 : nextIndex;

            await playTrack(
              next,
              state.queue,
              state.queueIndex
            );
          }

        } else {
          state.queue.splice(index, 1);

          if (index < state.queueIndex) {
            state.queueIndex--;
          }
        }

        openQueue();

      } else if (action === "like-current") {
        if (!state.currentTrack) return;

        await api(
          `/api/tracks/${encodeURIComponent(state.currentTrack.id)}/like`,
          {
            method: "POST",
            body: JSON.stringify(state.currentTrack)
          }
        );

        showToast("Added to Liked Songs");
      }

    } catch (error) {
      showToast(error.message || "Something went wrong");
    }
  });

  document.addEventListener("input", event => {
    if (event.target.id === "searchInput") {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(runSearch, 320);
    }
  });

  document.addEventListener("keydown", event => {
    if (
      event.target.id === "searchInput" &&
      event.key === "Enter"
    ) {
      event.preventDefault();
      runSearch();
    }
  });

  document.addEventListener("dragstart", event => {
    const row = event.target.closest(
      ".track-row[draggable='true']"
    );

    if (!row) return;

    state.dragId = row.dataset.trackId;
    row.classList.add("dragging");

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", state.dragId);
    }
  });

  document.addEventListener("dragover", event => {
    const row = event.target.closest(
      ".track-row[draggable='true']"
    );

    if (!row || !state.dragId) return;

    event.preventDefault();
    row.classList.add("drag-over");
  });

  document.addEventListener("dragleave", event => {
    event.target.closest(".track-row")?.classList.remove("drag-over");
  });

  document.addEventListener("drop", async event => {
    const row = event.target.closest(
      ".track-row[draggable='true']"
    );

    if (!row || !state.dragId || !state.activePlaylist) {
      return;
    }

    event.preventDefault();

    const playlist = state.activePlaylist;
    const tracks = playlist.tracks.slice();

    const from = tracks.findIndex(
      track => String(track.id) === String(state.dragId)
    );

    const to = Number(row.dataset.index);

    if (
      from < 0 ||
      to < 0 ||
      to >= tracks.length ||
      from === to
    ) {
      state.dragId = null;
      return;
    }

    const [moved] = tracks.splice(from, 1);
    tracks.splice(to, 0, moved);

    try {
      const result = await api(
        `/api/playlists/${encodeURIComponent(playlist.id)}/tracks/order`,
        {
          method: "PUT",
          body: JSON.stringify({
            track_ids: tracks.map(track => track.id),
            version: playlist.version
          })
        }
      );

      state.activePlaylist = result.playlist;
      renderPlaylist();

      showToast("Playlist order updated");

    } catch (error) {
      await reloadActivePlaylist();
      showToast(error.message);

    } finally {
      state.dragId = null;
    }
  });

  document.addEventListener("dragend", () => {
    state.dragId = null;

    document.querySelectorAll(".dragging,.drag-over").forEach(element => {
      element.classList.remove("dragging", "drag-over");
    });
  });

  $("seek").addEventListener("input", () => {
    if (
      Number.isFinite(audio.duration) &&
      audio.duration > 0
    ) {
      audio.currentTime =
        (Number($("seek").value) / 1000) * audio.duration;
    }
  });

  audio.addEventListener("timeupdate", () => {
    const duration = Number(audio.duration) || 0;
    const current = Number(audio.currentTime) || 0;
    const progress = duration > 0 ? current / duration : 0;

    $("miniProgress").style.width = `${progress * 100}%`;
    $("seek").value = String(Math.round(progress * 1000));

    $("elapsed").textContent = shortTime(current);

    $("remaining").textContent =
      `-${shortTime(Math.max(0, duration - current))}`;
  });

  audio.addEventListener("play", updatePlayer);
  audio.addEventListener("pause", updatePlayer);

  audio.addEventListener("ended", async () => {
    if (state.repeat && state.currentTrack) {
      await playTrack(
        state.currentTrack,
        state.queue,
        state.queueIndex
      );
    } else {
      await nextTrack();
    }
  });

  audio.addEventListener("error", () => {
    if (state.currentTrack) {
      showToast("This audio stream is unavailable. Try playing it again.");
    }
  });

  async function boot() {
    if (!initData) {
      document.querySelector("main").innerHTML = `
        <div class="empty" style="margin-top:40px">
          Open Taalune from the Telegram bot to sign in securely.
        </div>
      `;

      document.querySelector(".bottom-nav").style.display = "none";
      return;
    }

    try {
      await loadProfile();
      await loadHome();

    } catch (error) {
      showToast(error.message);
    }
  }

  boot();
})();