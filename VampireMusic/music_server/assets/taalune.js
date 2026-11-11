(() => {
  "use strict";

  const tg = window.Telegram?.WebApp;
  const initData = tg?.initData || "";
  const $ = id => document.getElementById(id);
  const audio = $("audio");

  const state = {
    page: "home",

    profile: null,
    activePerson: null,
    activePlaylist: null,

    playlists: [],
    discover: [],
    liked: [],
    likedLoaded: false,
    notifications: [],

    searchMode: "music",
    searchQuery: "",
    searchResults: [],
    searchRequest: 0,

    libraryScope: "mine",

    selectedGroup: null,
    groupStatus: null,

    currentTrack: null,
    queue: [],
    queueIndex: -1,

    playbackRequest: 0,
    playbackLoading: false,

    shuffle: false,
    shuffleBag: [],
    repeatMode: 0,

    homeRendered: false,
    homeTracks: [],
    homeLoadedAt: 0,
    homeFeedLoadedAt: 0,
    homeRequest: 0,

    modalTrack: null,
    addTargetPlaylist: null,
    selectedInvite: null,
    modalPeople: [],

    dragId: null,

    lastHistoryTrackId: "",
    lastHistoryAt: 0
  };

  let searchTimer = null;
  let toastTimer = null;
  let groupRefreshTimer = null;

  const previewObjectUrls = new Map();

  const UPLOAD_FIELDS = {
    newPlaylistCoverFile: {
      preview: "newPlaylistCoverPreview",
      previewWrap: "newPlaylistCoverPreviewWrap",
      status: "newPlaylistCoverStatus",
      progress: "newPlaylistCoverProgress",
      progressWrap: "newPlaylistCoverProgressWrap"
    },

    editPlaylistCoverFile: {
      preview: "editPlaylistCoverPreview",
      previewWrap: "editPlaylistCoverPreviewWrap",
      status: "editPlaylistCoverStatus",
      progress: "editPlaylistCoverProgress",
      progressWrap: "editPlaylistCoverProgressWrap"
    },

    profileAvatarFile: {
      preview: "profileAvatarPreview",
      previewWrap: "profileAvatarPreviewWrap",
      status: "profileAvatarStatus",
      progress: "profileAvatarProgress",
      progressWrap: "profileAvatarProgressWrap"
    }
  };

  const ICONS = {
    music: '<path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>',

    search: '<circle cx="10.8" cy="10.8" r="7.2"></circle><path d="m16.2 16.2 4.3 4.3"></path>',

    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"></path>',

    user: '<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>',

    library: '<path d="M4 4h16v16H4z"></path><path d="M8 8h8M8 12h8M8 16h5"></path>',

    heart: '<path d="M20.8 8.8c0 5.2-8.8 11-8.8 11s-8.8-5.8-8.8-11A4.8 4.8 0 0 1 12 6.2a4.8 4.8 0 0 1 8.8 2.6Z"></path>',

    heartFill: '<path fill="currentColor" stroke="none" d="M20.8 8.8c0 5.2-8.8 11-8.8 11s-8.8-5.8-8.8-11A4.8 4.8 0 0 1 12 6.2a4.8 4.8 0 0 1 8.8 2.6Z"></path>',

    play: '<path fill="currentColor" stroke="none" d="M7 4.8c0-.8.9-1.3 1.6-.9l11 7.2a1.1 1.1 0 0 1 0 1.8l-11 7.2c-.7.4-1.6-.1-1.6-.9z"></path>',

    pause: '<path d="M8 5h3v14H8zM15 5h3v14h-3z"></path>',

    next: '<path d="M5 5v14l10-7zM19 5v14"></path>',

    previous: '<path d="M19 5v14L9 12zM5 5v14"></path>',

    plus: '<path d="M12 5v14M5 12h14"></path>',

    close: '<path d="m6 6 12 12M18 6 6 18"></path>',

    refresh: '<path d="M20 7v5h-5"></path><path d="M20 12a8 8 0 1 1-2.3-5.7L20 9"></path>',

    upload: '<path d="M12 16V4m-5 5 5-5 5 5"></path><path d="M4 16v4h16v-4"></path>',

    trash: '<path d="M3 6h18M8 6V4h8v2m-10 0 1 14h10l1-14M10 10v6m4-6v6"></path>',

    check: '<path d="m5 12 4 4L19 6"></path>',

    up: '<path d="m6 15 6-6 6 6"></path>',

    down: '<path d="m6 9 6 6 6-6"></path>',

    shuffle: '<path d="m16 3 4 4-4 4M4 17l5-5 3-3 4-3h4"></path><path d="m16 17 4 4-4 4M4 7l5 5 3 3"></path>',

    repeat: '<path d="m17 1 4 4-4 4M3 11V9a4 4 0 0 1 4-4h14"></path><path d="m7 23-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"></path>',

    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path>',

    star: '<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"></path>',

    moon: '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z"></path>',

    headphones: '<path d="M3 14v-3a9 9 0 0 1 18 0v3"></path><rect x="2" y="13" width="5" height="8" rx="2"></rect><rect x="17" y="13" width="5" height="8" rx="2"></rect>',

    globe: '<circle cx="12" cy="12" r="10"></circle><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"></path>'
  };

  const API_MESSAGES = {
    unauthorized: "Open Taalune from the Telegram bot to sign in.",
    invalid_chat_id: "That Telegram group ID is invalid.",
    group_only: "Enter a Telegram supergroup ID.",
    supergroup_required: "This group must be a supergroup.",
    bot_cannot_access_group: "The music bot cannot access this group.",
    assistant_unavailable: "The assigned music assistant is unavailable.",
    userbot_cannot_verify_membership: "Assistant could not verify your membership.",
    not_group_member: "You are not a member of this group.",
    bot_not_in_group: "Add the music bot to this group first.",
    assistant_not_in_group: "Assistant account is not in this group.",
    unable_to_verify_group_clients: "Could not verify group playback clients.",
    group_control_permission_denied: "You can view this group, but cannot control playback.",
    voice_chat_playback_not_started: "Voice chat playback could not start.",
    nothing_playing: "Nothing is playing in this group.",
    already_paused: "Group playback is already paused.",
    already_playing: "Group playback is already playing.",
    group_queue_limit: "Group queue is full.",
    playlist_empty: "This playlist has no songs.",
    duplicate_track: "This song is already in the playlist.",
    playlist_track_limit: "Playlist has reached its song limit.",
    playlist_version_conflict: "Playlist changed. Reload and try again.",
    playlist_changed_retry: "Playlist changed. Reload and try again.",
    private_playlist: "You do not have access to this playlist.",
    private_playlist_cannot_be_followed: "Private playlists cannot be followed.",
    permission_denied: "You do not have permission for this action.",
    owner_only_visibility: "Only the playlist owner can change visibility.",
    collaborator_not_found: "That collaborator is no longer on this playlist.",
    invitation_not_found: "That invitation is no longer available.",
    query_too_short: "Type at least two characters.",
    image_required: "Choose an image first.",
    image_too_large: "Image must be 5 MB or smaller.",
    unsupported_image: "Use a valid JPG, PNG or WebP image.",
    invalid_image: "Selected image could not be read.",
    upload_rate_limited: "Wait a few seconds before uploading again.",
    catbox_unavailable: "Catbox is temporarily unavailable.",
    catbox_invalid_response: "Catbox returned an invalid response.",
    catbox_rejected: "Catbox rejected this image.",
    handle_taken: "This username is already taken.",
    invalid_handle: "Use 3–24 letters, numbers or underscores.",
    private_profile: "This profile is private."
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

  function icon(name, size = 18) {
    return `
      <svg
        width="${Number(size) || 18}"
        height="${Number(size) || 18}"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >${ICONS[name] || ICONS.music}</svg>
    `;
  }

  function formatTime(value) {
    const seconds = Math.max(
      0,
      Math.floor(Number(value) || 0)
    );

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;

    if (hours > 0) {
      return (
        `${hours}:` +
        `${String(minutes).padStart(2, "0")}:` +
        `${String(remainder).padStart(2, "0")}`
      );
    }

    return (
      `${minutes}:` +
      `${String(remainder).padStart(2, "0")}`
    );
  }

  function getTrackDuration(track) {
    const audioDuration = Number(audio.duration);

    if (
      Number.isFinite(audioDuration) &&
      audioDuration > 0 &&
      state.currentTrack &&
      String(state.currentTrack.id) === String(track?.id)
    ) {
      return audioDuration;
    }

    return Math.max(
      0,
      Number(track?.duration_sec) || 0
    );
  }

  function image(url, className = "") {
    if (!url) {
      return `
        <div class="${esc(className)} cover-placeholder">
          ${icon("music", 25)}
        </div>
      `;
    }

    return `
      <img
        class="${esc(className)}"
        src="${esc(url)}"
        alt=""
        loading="lazy"
        referrerpolicy="no-referrer"
      >
    `;
  }

  function showToast(message) {
    const element = $("toast");
    if (!element) return;

    element.textContent = String(
      message || "Something went wrong."
    );

    element.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      element.classList.remove("show");
    }, 2800);
  }

  async function api(path, options = {}) {
    if (!initData) {
      throw new Error(
        "Open Taalune from the Telegram bot to sign in."
      );
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

    let response;

    try {
      response = await fetch(path, {
        ...options,
        headers
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw error;
      }

      throw new Error(
        "Network connection failed. Please try again."
      );
    }

    const contentType =
      response.headers.get("content-type") || "";

    let data = {};

    if (contentType.includes("application/json")) {
      try {
        data = await response.json();
      } catch (_) {
        data = {};
      }
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

  function closeAllOverlays() {
    $("sheetOverlay")?.classList.remove("open");
    $("queueOverlay")?.classList.remove("open");
    $("fullPlayer")?.classList.remove("open");
  }

  function setPage(page) {
    if (!$( `page-${page}` )) return;

    const previous = state.page;
    state.page = page;

    document.querySelectorAll(".page").forEach(element => {
      element.classList.toggle(
        "active",
        element.id === `page-${page}`
      );
    });

    document.querySelectorAll(".nav-button").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.page === page
      );
    });

    if (previous !== page) {
      window.scrollTo({
        top: 0,
        behavior: "auto"
      });
    }

    if (page === "home") {
      loadHome(false);
    }

    if (page === "search") {
      if (!$("searchInput")) {
        renderSearchShell();
      }
    }

    if (page === "library") {
      if (!$("libraryItems")) {
        renderLibrary();
      }
    }

    if (page === "groups") {
      renderGroups();
    }

    if (page === "profile") {
      renderProfile();
    }

    if (page === "notifications") {
      loadNotifications();
    }

    if (page === "playlist") {
      renderPlaylist();
    }

    if (page === "person") {
      renderPerson();
    }
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

      fallback.textContent = (
        state.profile?.display_name?.[0] ||
        "U"
      ).toUpperCase();

      fallback.hidden = false;
    }
  }

  function isTrackLiked(trackId) {
    return state.liked.some(
      track => String(track.id) === String(trackId)
    );
  }

  function findTrack(trackId) {
    const sources = [
      state.searchResults,
      state.homeTracks,
      state.liked,
      state.activePlaylist?.tracks || [],
      state.queue
    ];

    for (const source of sources) {
      const track = source.find(
        item => String(item.id) === String(trackId)
      );

      if (track) return track;
    }

    if (
      state.currentTrack &&
      String(state.currentTrack.id) === String(trackId)
    ) {
      return state.currentTrack;
    }

    return null;
  }

  function playlistCard(playlist) {
    const owner = playlist.owner || {};
    const isOwn = Number(owner.user_id) ===
      Number(state.profile?.user_id);

    return `
      <article class="playlist-card">
        <button
          class="playlist-open"
          data-action="open-playlist"
          data-id="${esc(playlist.id)}"
        >
          ${image(playlist.cover_url, "playlist-cover")}

          <span class="playlist-title">
            ${esc(playlist.name)}
          </span>

          <span class="playlist-owner">
            by @${esc(owner.handle || "listener")}
          </span>
        </button>

        <div class="playlist-stats">
          <span>
            ${Number(playlist.track_count || 0)} songs
          </span>

          <span>
            ${icon("heart", 11)}
            ${Number(playlist.like_count || 0)}
          </span>
        </div>

        <div class="playlist-card-actions">
          ${isOwn ? "" : `
            <button
              class="track-action"
              data-action="playlist-follow"
              data-id="${esc(playlist.id)}"
              aria-label="Follow playlist"
              title="${playlist.followed ? "Unfollow" : "Follow"}"
            >
              ${playlist.followed
                ? icon("check", 17)
                : icon("plus", 17)}
            </button>
          `}
        </div>
      </article>
    `;
  }

  function trackRow(track, index, options = {}) {
    const liked = isTrackLiked(track.id);

    return `
      <div
        class="track-row"
        ${options.draggable ? 'draggable="true"' : ""}
        data-track-id="${esc(track.id)}"
        data-index="${Number(index) || 0}"
      >
        ${image(track.thumbnail, "track-cover")}

        <div class="track-copy">
          <div class="track-title">
            ${esc(track.title)}
          </div>

          <div class="track-sub">
            ${esc(track.artist || "Unknown artist")}
            · ${formatTime(track.duration_sec)}
          </div>
        </div>

        <div class="track-actions">

          <button
            class="track-action"
            data-action="like-track"
            data-id="${esc(track.id)}"
            aria-label="${liked ? "Unlike song" : "Like song"}"
            aria-pressed="${liked ? "true" : "false"}"
          >
            ${icon(liked ? "heartFill" : "heart", 17)}
          </button>

          ${options.add ? `
            <button
              class="track-action"
              data-action="add-track"
              data-id="${esc(track.id)}"
              aria-label="Add song to playlist"
              title="Add to playlist"
            >
              ${icon("plus", 17)}
            </button>
          ` : ""}

          ${options.group ? `
            <button
              class="track-action"
              data-action="group-play-track"
              data-id="${esc(track.id)}"
              aria-label="Play now in group"
              title="Play now in group"
            >
              ${icon("play", 16)}
            </button>

            <button
              class="track-action"
              data-action="group-track"
              data-id="${esc(track.id)}"
              aria-label="Add to group queue"
              title="Add to group queue"
            >
              ${icon("users", 17)}
            </button>
          ` : ""}

          ${options.reorder ? `
            <span class="track-management">
              <button
                data-action="move-track-up"
                data-id="${esc(track.id)}"
                aria-label="Move up"
              >
                ${icon("up", 14)}
              </button>

              <button
                data-action="move-track-down"
                data-id="${esc(track.id)}"
                aria-label="Move down"
              >
                ${icon("down", 14)}
              </button>
            </span>
          ` : ""}

          ${options.remove ? `
            <button
              class="track-action"
              data-action="remove-track"
              data-id="${esc(track.id)}"
              aria-label="Remove song"
            >
              ${icon("trash", 16)}
            </button>
          ` : ""}

          <button
            class="play-circle"
            data-action="play-track"
            data-id="${esc(track.id)}"
            aria-label="Play in personal player"
            title="Personal player"
          >
            ${icon("play", 17)}
          </button>

        </div>
      </div>
    `;
  }

  async function loadProfile() {
    const data = await api("/api/profile");

    state.profile = data.profile;

    setAvatar();

    return state.profile;
  }

  async function loadLikedTracks() {
    const data = await api(
      "/api/library/liked-tracks?limit=50"
    );

    state.liked = Array.isArray(data.results)
      ? data.results
      : [];

    state.likedLoaded = true;

    return state.liked;
  }

  async function toggleTrackLike(track) {
    if (!track?.id) {
      throw new Error("Song details are unavailable.");
    }

    if (!state.likedLoaded) {
      await loadLikedTracks();
    }

    const id = String(track.id);

    if (isTrackLiked(id)) {
      await api(
        `/api/tracks/${encodeURIComponent(id)}/like`,
        { method: "DELETE" }
      );

      state.liked = state.liked.filter(
        item => String(item.id) !== id
      );

      showToast("Removed from Liked Songs");

    } else {
      const payload = {
        id: track.id,
        title: track.title,
        artist: track.artist || "Unknown artist",
        duration_sec: Number(track.duration_sec || 0),
        thumbnail: track.thumbnail || null
      };

      await api(
        `/api/tracks/${encodeURIComponent(id)}/like`,
        {
          method: "POST",
          body: JSON.stringify(payload)
        }
      );

      state.liked.unshift(payload);

      showToast("Added to Liked Songs");
    }

    if (state.page === "library" && state.libraryScope === "liked") {
      renderLibraryItems();
    }

    if (state.page === "home") {
      refreshHomeTrackRows();
    }

    if (state.page === "search" && state.searchMode === "music") {
      renderSearchResults();
    }

    updatePlayer();
  }

  function refreshHomeTrackRows() {
    const target = $("homeTracks");
    if (!target) return;

    target.innerHTML = state.homeTracks.length
      ? state.homeTracks.map((track, index) =>
          trackRow(track, index, {
            add: true,
            group: Boolean(state.selectedGroup)
          })
        ).join("")
      : '<div class="empty">No recommendations available.</div>';
  }

  function renderHomeShell() {
    const page = $("page-home");
    if (!page) return;

    page.innerHTML = `
      <section class="hero-card">
        <div class="hero-content">
          <div class="eyebrow">Your listening space</div>

          <h1>
            Your music.<br>
            Your moments.
          </h1>

          <p>
            Discover music, build playlists and share your
            listening with your Telegram groups.
          </p>

          <div class="hero-actions">
            <button class="primary-button" data-page="search">
              ${icon("search", 16)}
              Explore music
            </button>

            <button class="secondary-button" data-page="library">
              ${icon("library", 16)}
              Your library
            </button>
          </div>
        </div>
      </section>

      <section>
        <div class="section-head">
          <h2>Made for your listening</h2>

          <button data-action="refresh-home">
            ${icon("refresh", 14)}
            Refresh
          </button>
        </div>

        <p id="homeSongStatus" class="search-status">
          Preparing your personal mix…
        </p>

        <div id="homeTracks" class="list">
          <div class="skeleton"></div>
          <div class="skeleton"></div>
          <div class="skeleton"></div>
        </div>
      </section>

      <section>
        <div class="section-head">
          <h2>Trending playlists</h2>

          <button data-action="open-discover">
            Explore all
          </button>
        </div>

        <div id="homeDiscover" class="grid">
          <div class="skeleton"></div>
          <div class="skeleton"></div>
        </div>
      </section>

      <section>
        <div class="section-head">
          <h2>Fresh from creators</h2>
        </div>

        <div id="homeFresh" class="grid">
          <div class="skeleton"></div>
          <div class="skeleton"></div>
        </div>
      </section>

      <section>
        <div class="section-head">
          <h2>Your playlists</h2>

          <button data-action="create-playlist">
            ${icon("plus", 14)}
            Create
          </button>
        </div>

        <div id="homeMine" class="grid">
          <div class="empty">Loading your playlists…</div>
        </div>
      </section>
    `;
  }

  async function loadHome(force = false) {
    if (!state.homeRendered) {
      renderHomeShell();
      state.homeRendered = true;
    }

    if (
      !force &&
      state.homeFeedLoadedAt &&
      Date.now() - state.homeFeedLoadedAt < 120000
    ) {
      if (
        !state.homeLoadedAt ||
        Date.now() - state.homeLoadedAt >= 180000
      ) {
        await loadHomeTracks(false);
      }

      return;
    }

    const results = await Promise.allSettled([
      api("/api/playlists?scope=trending&limit=12"),
      api("/api/playlists?scope=fresh&limit=12"),
      api("/api/playlists?scope=mine&limit=12")
    ]);

    const [trendingResult, freshResult, mineResult] = results;

    if (trendingResult.status === "fulfilled") {
      state.discover = trendingResult.value.results || [];

      $("homeDiscover").innerHTML = state.discover.length
        ? state.discover.map(playlistCard).join("")
        : '<div class="empty">Public playlists will appear here.</div>';

    } else {
      $("homeDiscover").innerHTML =
        `<div class="empty">${esc(trendingResult.reason.message)}</div>`;
    }

    if (freshResult.status === "fulfilled") {
      const fresh = freshResult.value.results || [];

      $("homeFresh").innerHTML = fresh.length
        ? fresh.map(playlistCard).join("")
        : '<div class="empty">No new public playlists yet.</div>';

    } else {
      $("homeFresh").innerHTML =
        `<div class="empty">${esc(freshResult.reason.message)}</div>`;
    }

    if (mineResult.status === "fulfilled") {
      state.playlists = mineResult.value.results || [];

      $("homeMine").innerHTML = state.playlists.length
        ? state.playlists.map(playlistCard).join("")
        : '<div class="empty">Create your first playlist.</div>';

    } else {
      $("homeMine").innerHTML =
        `<div class="empty">${esc(mineResult.reason.message)}</div>`;
    }

    state.homeFeedLoadedAt = Date.now();

    await loadHomeTracks(force);
  }

  async function loadHomeTracks(force = false) {
    const target = $("homeTracks");
    const status = $("homeSongStatus");

    if (!target || !status) return;

    if (
      !force &&
      state.homeTracks.length &&
      Date.now() - state.homeLoadedAt < 180000
    ) {
      refreshHomeTrackRows();
      return;
    }

    const requestId = ++state.homeRequest;

    status.textContent = "Finding music based on your listening…";

    target.innerHTML = `
      <div class="skeleton"></div>
      <div class="skeleton"></div>
      <div class="skeleton"></div>
    `;

    try {
      const data = await api("/api/recommendations");

      if (requestId !== state.homeRequest) return;

      state.homeTracks = Array.isArray(data.results)
        ? data.results
        : [];

      state.homeLoadedAt = Date.now();

      refreshHomeTrackRows();

      status.textContent = data.reason || (
        data.personalized
          ? "Picked from your recent listening."
          : "Start listening to build your personal mix."
      );

    } catch (error) {
      if (requestId !== state.homeRequest) return;

      target.innerHTML =
        `<div class="empty">${esc(error.message)}</div>`;

      status.textContent = "Recommendations could not be loaded.";
    }
  }

  function renderSearchShell() {
    $("page-search").innerHTML = `
      <div class="eyebrow">Find your next favourite</div>
      <h1 class="page-title">Search</h1>

      <div class="search-box">
        ${icon("search", 19)}

        <input
          id="searchInput"
          type="search"
          autocomplete="off"
          maxlength="120"
          placeholder="Songs, artists, people or playlists"
          value="${esc(state.searchQuery)}"
        >
      </div>

      <div class="pill-row" style="margin-top:14px">
        <button
          class="pill ${state.searchMode === "music" ? "active" : ""}"
          data-search-mode="music"
        >
          ${icon("music", 14)}
          Music
        </button>

        <button
          class="pill ${state.searchMode === "playlists" ? "active" : ""}"
          data-search-mode="playlists"
        >
          ${icon("library", 14)}
          Playlists
        </button>

        <button
          class="pill ${state.searchMode === "people" ? "active" : ""}"
          data-search-mode="people"
        >
          ${icon("users", 14)}
          People
        </button>
      </div>

      <div id="searchStatus" class="search-status">
        Search music, creators and public playlists.
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

    const target = $("searchResults");
    const status = $("searchStatus");

    if (!target || !status) return;

    if (query.length < 2) {
      state.searchResults = [];

      status.textContent = "Type at least two characters.";
      target.innerHTML = "";

      return;
    }

    const requestId = ++state.searchRequest;

    status.textContent = "Searching…";
    target.innerHTML = `
      <div class="skeleton"></div>
      <div class="skeleton"></div>
    `;

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

      renderSearchResults();

      status.textContent =
        `${state.searchResults.length} result${
          state.searchResults.length === 1 ? "" : "s"
        }`;
    } catch (error) {
      if (requestId !== state.searchRequest) return;

      state.searchResults = [];
      target.innerHTML =
        `<div class="empty">${esc(error.message)}</div>`;

      status.textContent = "Search failed.";
    }
  }

  function renderSearchResults() {
    const target = $("searchResults");
    if (!target) return;

    if (!state.searchResults.length) {
      target.className = "list";
      target.innerHTML = '<div class="empty">No results found.</div>';
      return;
    }

    if (state.searchMode === "music") {
      target.className = "list";

      target.innerHTML = state.searchResults.map(
        (track, index) => trackRow(track, index, {
          add: true,
          group: Boolean(state.selectedGroup)
        })
      ).join("");

      return;
    }

    if (state.searchMode === "playlists") {
      target.className = "grid";
      target.innerHTML = state.searchResults.map(playlistCard).join("");
      return;
    }

    target.className = "list";

    target.innerHTML = state.searchResults.map(person => `
      <div class="person-row">
        ${image(person.avatar_url, "person-avatar")}

        <div class="grow">
          <div class="track-title">
            ${esc(person.display_name)}
          </div>

          <div class="track-sub">
            @${esc(person.handle)}
            · ${Number(person.followers || 0)} followers
          </div>
        </div>

        <button
          class="secondary-button"
          data-action="follow-person"
          data-id="${esc(person.user_id)}"
          data-state="${esc(person.follow_state || "")}"
        >
          ${person.follow_state === "accepted"
            ? "Following"
            : person.follow_state === "pending"
              ? "Requested"
              : "Follow"}
        </button>

        <button
          class="track-action"
          data-action="open-person"
          data-handle="${esc(person.handle)}"
          aria-label="Open profile"
        >
          ${icon("user", 18)}
        </button>
      </div>
    `).join("");
  }

  function setSearchMode(mode) {
    if (!["music", "playlists", "people"].includes(mode)) {
      return;
    }

    state.searchMode = mode;

    document.querySelectorAll("[data-search-mode]").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.searchMode === mode
      );
    });

    runSearch();
  }

  function renderLibrary() {
    $("page-library").innerHTML = `
      <div class="eyebrow">Your collection</div>

      <div class="section-head">
        <h1 class="page-title">Your library</h1>

        <button data-action="create-playlist">
          ${icon("plus", 15)}
          Create
        </button>
      </div>

      <div class="pill-row">
        <button class="pill" data-library-scope="mine">
          Playlists
        </button>

        <button class="pill" data-library-scope="discover">
          Discover
        </button>

        <button class="pill" data-library-scope="following">
          Following
        </button>

        <button class="pill" data-library-scope="collaborating">
          Collaborating
        </button>

        <button class="pill" data-library-scope="liked">
          Liked songs
        </button>
      </div>

      <div id="libraryStatus" class="search-status"></div>
      <div id="libraryItems" class="grid"></div>
    `;

    showLibraryScope(state.libraryScope || "mine");
  }

  async function showLibraryScope(scope) {
    const allowed = [
      "mine",
      "discover",
      "following",
      "collaborating",
      "liked"
    ];

    if (!allowed.includes(scope)) return;

    state.libraryScope = scope;

    document.querySelectorAll("[data-library-scope]").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.libraryScope === scope
      );
    });

    await renderLibraryItems();
  }

  async function renderLibraryItems() {
    const target = $("libraryItems");
    const status = $("libraryStatus");

    if (!target) return;

    target.className =
      state.libraryScope === "liked" ? "list" : "grid";

    target.innerHTML = '<div class="skeleton"></div>';

    if (status) status.textContent = "Loading your library…";

    try {
      if (state.libraryScope === "liked") {
        await loadLikedTracks();

        target.innerHTML = state.liked.length
          ? state.liked.map((track, index) =>
              trackRow(track, index, {
                group: Boolean(state.selectedGroup)
              })
            ).join("")
          : '<div class="empty">Songs you like will appear here.</div>';

      } else {
        const data = await api(
          `/api/playlists?scope=${encodeURIComponent(state.libraryScope)}&limit=50`
        );

        const items = data.results || [];

        if (state.libraryScope === "mine") {
          state.playlists = items;
        }

        target.innerHTML = items.length
          ? items.map(playlistCard).join("")
          : '<div class="empty">Nothing here yet.</div>';
      }

      if (status) status.textContent = "";

    } catch (error) {
      target.innerHTML =
        `<div class="empty">${esc(error.message)}</div>`;

      if (status) status.textContent = "Unable to load this section.";
    }
  }

  async function renderProfile() {
    const page = $("page-profile");

    if (!state.profile) {
      page.innerHTML = '<div class="empty">Loading profile…</div>';

      try {
        await loadProfile();
      } catch (error) {
        page.innerHTML =
          `<div class="empty">${esc(error.message)}</div>`;
        return;
      }
    }

    const profile = state.profile;

    const avatar = profile.avatar_url
      ? image(profile.avatar_url, "profile-big-avatar")
      : `<div class="profile-big-avatar profile-placeholder">${icon("user", 34)}</div>`;

    page.innerHTML = `
      <div class="eyebrow">Your account</div>

      <div class="profile-head">
        ${avatar}

        <h1>${esc(profile.display_name)}</h1>

        <p class="muted small">
          @${esc(profile.handle)}
        </p>

        <p class="profile-bio">
          ${esc(profile.bio || "No bio added yet.")}
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

        <button class="primary-button" data-action="edit-profile">
          Edit profile
        </button>
      </div>

      <div class="divider"></div>

      <div class="section-head">
        <h2>Your public playlists</h2>

        <button data-action="open-discover">
          Discover
        </button>
      </div>

      <div id="profilePlaylists" class="grid">
        <div class="empty">Loading playlists…</div>
      </div>

      <div class="section-head">
        <h2>Account settings</h2>
      </div>

      <div class="track-row">
        <div class="track-copy">
          <div class="track-title">Profile visibility</div>
          <div class="track-sub">
            ${esc(profile.visibility)}
          </div>
        </div>

        <button
          class="secondary-button"
          data-action="toggle-profile-privacy"
        >
          Change
        </button>
      </div>
    `;

    try {
      const data = await api(
        "/api/playlists?scope=mine&limit=50"
      );

      const target = $("profilePlaylists");
      if (!target) return;

      const publicItems = (data.results || []).filter(
        item => item.visibility === "public"
      );

      target.innerHTML = publicItems.length
        ? publicItems.map(playlistCard).join("")
        : '<div class="empty">No public playlists yet.</div>';

    } catch (_) {
      const target = $("profilePlaylists");

      if (target) {
        target.innerHTML =
          '<div class="empty">Could not load playlists.</div>';
      }
    }
  }

  async function openPerson(handle) {
    const data = await api(
      `/api/people/${encodeURIComponent(handle)}`
    );

    state.activePerson = data;

    setPage("person");
  }

  function renderPerson() {
    const data = state.activePerson;

    if (!data?.profile) {
      $("page-person").innerHTML =
        '<div class="empty">Profile not found.</div>';
      return;
    }

    const person = data.profile;

    const avatar = person.avatar_url
      ? image(person.avatar_url, "profile-big-avatar")
      : `<div class="profile-big-avatar profile-placeholder">${icon("user", 35)}</div>`;

    $("page-person").innerHTML = `
      <button class="secondary-button" data-page="search">
        ← Back to search
      </button>

      <div class="profile-head">
        ${avatar}

        <h1>${esc(person.display_name)}</h1>

        <p class="muted small">@${esc(person.handle)}</p>

        <p class="profile-bio">${esc(person.bio || "")}</p>

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
          <button
            class="primary-button"
            data-action="follow-person"
            data-id="${esc(person.user_id)}"
            data-state="${esc(person.follow_state || "")}"
          >
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
          '<div class="empty">No public playlists.</div>'}
      </div>
    `;
  }

  async function loadNotifications() {
    const page = $("page-notifications");

    page.innerHTML = `
      <div class="eyebrow">Your activity</div>
      <h1 class="page-title">Notifications</h1>

      <div id="notificationItems" class="list">
        <div class="skeleton"></div>
        <div class="skeleton"></div>
      </div>
    `;

    try {
      const data = await api("/api/notifications?limit=40");

      state.notifications = data.results || [];

      const unread = state.notifications.some(
        item => !item.read
      );

      $("notificationDot").hidden = !unread;

      $("notificationItems").innerHTML =
        state.notifications.length
          ? state.notifications.map(renderNotification).join("")
          : '<div class="empty">You are all caught up.</div>';

    } catch (error) {
      $("notificationItems").innerHTML =
        `<div class="empty">${esc(error.message)}</div>`;
    }
  }

  function renderNotification(notification) {
    const payload = notification.payload || {};
    const actor = esc(
      notification.actor?.display_name || "Someone"
    );

    let message = "You have an update.";
    let actions = "";
    let iconName = "bell";

    if (notification.type === "collaboration_invitation") {
      iconName = "users";

      message =
        `${actor} invited you to collaborate on ` +
        `<b>${esc(payload.playlist_name)}</b>.`;

      actions = `
        <button
          class="primary-button"
          data-action="invitation"
          data-id="${esc(payload.invitation_id)}"
          data-choice="accept"
        >
          Accept
        </button>

        <button
          class="secondary-button"
          data-action="invitation"
          data-id="${esc(payload.invitation_id)}"
          data-choice="reject"
        >
          Decline
        </button>
      `;

    } else if (notification.type === "follow_request") {
      iconName = "heart";

      message = `${actor} wants to follow you.`;

      actions = `
        <button
          class="primary-button"
          data-action="follow-response"
          data-id="${esc(payload.follower_id)}"
          data-choice="accept"
        >
          Accept
        </button>

        <button
          class="secondary-button"
          data-action="follow-response"
          data-id="${esc(payload.follower_id)}"
          data-choice="reject"
        >
          Decline
        </button>
      `;

    } else if (notification.type === "new_follower") {
      iconName = "heart";
      message = `${actor} started following you.`;

    } else if (notification.type === "playlist_followed") {
      iconName = "music";
      message =
        `${actor} followed your playlist ` +
        `<b>${esc(payload.playlist_name)}</b>.`;

    } else if (notification.type === "follow_accepted") {
      iconName = "heart";
      message = `${actor} accepted your follow request.`;

    } else if (
      notification.type === "collaboration_role_changed"
    ) {
      iconName = "users";
      message =
        `Your role on <b>${esc(payload.playlist_name)}</b> ` +
        `is now ${esc(payload.role)}.`;

    } else if (
      notification.type === "collaboration_removed"
    ) {
      iconName = "users";
      message =
        `You were removed from <b>${esc(payload.playlist_name)}</b>.`;

    } else if (
      notification.type === "collaboration_accepted"
    ) {
      iconName = "check";
      message =
        `${actor} accepted your collaboration invitation.`;

    } else if (
      notification.type === "collaboration_rejected"
    ) {
      iconName = "close";
      message =
        `${actor} declined your collaboration invitation.`;
    }

    return `
      <article class="notification ${notification.read ? "" : "unread"}">
        <div class="notification-icon">
          ${icon(iconName, 18)}
        </div>

        <div class="grow">
          <p>${message}</p>

          <div class="track-sub">
            ${esc(notification.created_at || "")}
          </div>

          ${actions
            ? `<div class="notification-actions">${actions}</div>`
            : ""}
        </div>

        <button
          class="track-action"
          data-action="read-notification"
          data-id="${esc(notification.id)}"
          aria-label="Mark notification read"
        >
          ${notification.read ? "" : icon("check", 16)}
        </button>
      </article>
    `;
  }

  async function openPlaylist(id) {
    try {
      const data = await api(
        `/api/playlists/${encodeURIComponent(id)}`
      );

      state.activePlaylist = data.playlist;

      setPage("playlist");

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

    const tracks = playlist.tracks || [];

    const canEdit = ["owner", "editor"].includes(
      playlist.role
    );

    const canAdd = [
      "owner",
      "editor",
      "contributor"
    ].includes(playlist.role);

    const isOwner = playlist.role === "owner";

    $("page-playlist").innerHTML = `
      <button class="secondary-button" data-page="library">
        ← Back to library
      </button>

      <div class="detail-head">
        ${image(playlist.cover_url, "detail-cover")}

        <div class="grow">
          <div class="eyebrow">
            ${esc(playlist.visibility)} playlist
          </div>

          <div class="detail-name">
            ${esc(playlist.name)}
          </div>

          <div class="track-sub">
            ${tracks.length} songs
            · by @${esc(playlist.owner?.handle || "listener")}
          </div>

          <div class="track-sub">
            ${Number(playlist.like_count || 0)} likes
            · ${Number(playlist.follower_count || 0)} followers
          </div>
        </div>
      </div>

      <p class="muted small">
        ${esc(playlist.description || "")}
      </p>

      <div class="detail-actions">
        <button
          class="primary-button"
          data-action="play-playlist"
          ${tracks.length ? "" : "disabled"}
        >
          ${icon("play", 15)}
          Play personally
        </button>

        <button
          class="secondary-button"
          data-action="like-playlist"
          data-id="${esc(playlist.id)}"
        >
          ${playlist.liked
            ? icon("heartFill", 15)
            : icon("heart", 15)}
          ${playlist.liked ? "Liked" : "Like"}
        </button>

        ${!isOwner ? `
          <button
            class="secondary-button"
            data-action="playlist-follow"
            data-id="${esc(playlist.id)}"
          >
            ${playlist.followed ? "Following" : "Follow"}
          </button>
        ` : ""}

        ${canAdd ? `
          <button
            class="secondary-button"
            data-action="add-from-search"
          >
            ${icon("plus", 15)}
            Add songs
          </button>
        ` : ""}

        ${state.selectedGroup ? `
          <button
            class="secondary-button"
            data-action="group-play-playlist"
          >
            ${icon("users", 15)}
            Play in group
          </button>

          <button
            class="secondary-button"
            data-action="group-queue-playlist"
          >
            ${icon("plus", 15)}
            Queue in group
          </button>
        ` : ""}

        ${canEdit ? `
          <button
            class="secondary-button"
            data-action="edit-playlist"
          >
            Edit
          </button>
        ` : ""}

        ${isOwner ? `
          <button
            class="secondary-button"
            data-action="invite-collaborator"
          >
            ${icon("users", 15)}
            Invite
          </button>

          <button
            class="danger-button"
            data-action="delete-playlist"
          >
            ${icon("trash", 15)}
            Delete
          </button>
        ` : ""}
      </div>

      <div class="section-head">
        <h2>Tracks</h2>
        <span class="muted small">${tracks.length} songs</span>
      </div>

      <div id="playlistTracks" class="list">
        ${tracks.length
          ? tracks.map((track, index) =>
              trackRow(track, index, {
                draggable: canEdit,
                reorder: canEdit,
                remove: canEdit,
                group: Boolean(state.selectedGroup)
              })
            ).join("")
          : '<div class="empty">This playlist is empty. Add songs to get started.</div>'}
      </div>

      ${isOwner ? `
        <div class="section-head">
          <h2>Collaborators</h2>
        </div>

        <div class="list">
          ${(playlist.collaborators || []).map(person => `
            <div class="person-row">
              <div class="grow">
                <div class="track-title">
                  ${esc(person.display_name || person.handle || "Listener")}
                </div>

                <div class="track-sub">
                  @${esc(person.handle || "unknown")}
                  · ${esc(person.role)}
                </div>
              </div>

              <button
                class="track-action"
                data-action="change-collaborator"
                data-id="${esc(person.user_id)}"
                aria-label="Change collaborator role"
              >
                ${icon("users", 16)}
              </button>

              <button
                class="track-action"
                data-action="remove-collaborator"
                data-id="${esc(person.user_id)}"
                aria-label="Remove collaborator"
              >
                ${icon("close", 16)}
              </button>
            </div>
          `).join("") || '<div class="empty">No collaborators yet.</div>'}
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

    for (const url of previewObjectUrls.values()) {
      URL.revokeObjectURL(url);
    }

    previewObjectUrls.clear();
  }

  function uploadFieldMarkup(prefix, label, currentValue = "") {
    const fileId = `${prefix}File`;
    const previewId = `${prefix}Preview`;
    const previewWrapId = `${prefix}PreviewWrap`;
    const progressId = `${prefix}Progress`;
    const progressWrapId = `${prefix}ProgressWrap`;
    const statusId = `${prefix}Status`;

    return `
      <div class="field">
        <label>${esc(label)}</label>

        <div class="upload-row">
          <input
            id="${esc(fileId)}"
            type="file"
            accept="image/jpeg,image/png,image/webp"
          >

          <button
            class="secondary-button"
            data-action="upload-cover"
            data-file="${esc(fileId)}"
            data-target="${esc(prefix)}"
          >
            ${icon("upload", 15)}
            Upload
          </button>
        </div>

        <div class="upload-help">
          JPG, PNG or WebP · Maximum 5 MB · Uploaded through Catbox.
        </div>

        <div id="${esc(previewWrapId)}" hidden>
          <img
            id="${esc(previewId)}"
            class="upload-preview"
            alt="Image preview"
          >
        </div>

        <div id="${esc(progressWrapId)}" hidden>
          <progress
            id="${esc(progressId)}"
            max="100"
            value="0"
          ></progress>

          <div
            id="${esc(statusId)}"
            class="upload-status"
            role="status"
          ></div>
        </div>

        <input
          id="${esc(prefix)}"
          type="url"
          maxlength="2048"
          value="${esc(currentValue)}"
          placeholder="Or paste an HTTPS image URL"
        >
      </div>
    `;
  }

  function createPlaylistSheet() {
    openSheet(
      "Create playlist",
      `
        <div class="field">
          <label>PLAYLIST NAME</label>

          <input
            id="newPlaylistName"
            maxlength="80"
            placeholder="Give your playlist a name"
          >
        </div>

        <div class="field">
          <label>DESCRIPTION</label>

          <textarea
            id="newPlaylistDescription"
            maxlength="500"
            placeholder="What is this playlist about?"
          ></textarea>
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
            <option value="public">Public · show in discovery</option>
            <option value="unlisted">Unlisted · link only</option>
          </select>
        </div>

        ${uploadFieldMarkup(
          "newPlaylistCover",
          "PLAYLIST COVER"
        )}
      `,
      `
        <button
          class="secondary-button"
          data-action="close-sheet"
        >
          Cancel
        </button>

        <button
          class="primary-button"
          data-action="save-playlist"
        >
          Create playlist
        </button>
      `
    );
  }

  function editPlaylistSheet() {
    const playlist = state.activePlaylist;

    if (!playlist) return;

    openSheet(
      "Edit playlist",
      `
        <div class="field">
          <label>NAME</label>

          <input
            id="editPlaylistName"
            maxlength="80"
            value="${esc(playlist.name)}"
          >
        </div>

        <div class="field">
          <label>DESCRIPTION</label>

          <textarea
            id="editPlaylistDescription"
            maxlength="500"
          >${esc(playlist.description || "")}</textarea>
        </div>

        <div class="field">
          <label>PLAYLIST ICON</label>

          <select id="editPlaylistIcon">
            ${[
              ["music", "Music"],
              ["heart", "Heart"],
              ["chill", "Chill"],
              ["star", "Star"],
              ["headphones", "Headphones"],
              ["group", "Group"]
            ].map(([value, label]) => `
              <option
                value="${value}"
                ${playlist.icon === value ? "selected" : ""}
              >
                ${label}
              </option>
            `).join("")}
          </select>
        </div>

        ${uploadFieldMarkup(
          "editPlaylistCover",
          "PLAYLIST COVER",
          playlist.cover_url || ""
        )}

        ${playlist.role === "owner" ? `
          <div class="field">
            <label>VISIBILITY</label>

            <select id="editPlaylistVisibility">
              <option
                value="private"
                ${playlist.visibility === "private" ? "selected" : ""}
              >
                Private
              </option>

              <option
                value="public"
                ${playlist.visibility === "public" ? "selected" : ""}
              >
                Public
              </option>

              <option
                value="unlisted"
                ${playlist.visibility === "unlisted" ? "selected" : ""}
              >
                Unlisted
              </option>
            </select>
          </div>
        ` : ""}
      `,
      `
        <button
          class="secondary-button"
          data-action="close-sheet"
        >
          Cancel
        </button>

        <button
          class="primary-button"
          data-action="save-playlist-edit"
        >
          Save changes
        </button>
      `
    );
  }

  function addTrackSheet(track) {
    state.modalTrack = track;

    const options = state.playlists.map(playlist => `
      <option value="${esc(playlist.id)}">
        ${esc(playlist.name)}
      </option>
    `).join("");

    openSheet(
      "Add to playlist",
      `
        <div class="track-row">
          ${image(track.thumbnail, "track-cover")}

          <div class="track-copy">
            <div class="track-title">${esc(track.title)}</div>
            <div class="track-sub">${esc(track.artist || "Unknown artist")}</div>
          </div>
        </div>

        <div class="field">
          <label>CHOOSE PLAYLIST</label>

          <select id="targetPlaylist">
            ${options || '<option value="">No playlists available</option>'}
          </select>
        </div>

        ${options ? "" : `
          <button
            class="secondary-button"
            data-action="create-playlist"
          >
            Create your first playlist
          </button>
        `}
      `,
      `
        <button
          class="secondary-button"
          data-action="close-sheet"
        >
          Cancel
        </button>

        <button
          class="primary-button"
          data-action="confirm-add-track"
          ${options ? "" : "disabled"}
        >
          Add song
        </button>
      `
    );
  }

  function editProfileSheet() {
    const profile = state.profile;

    if (!profile) return;

    openSheet(
      "Edit profile",
      `
        <div class="field">
          <label>USERNAME</label>

          <input
            id="profileHandle"
            maxlength="24"
            value="${esc(profile.handle)}"
          >
        </div>

        <div class="field">
          <label>DISPLAY NAME</label>

          <input
            id="profileName"
            maxlength="48"
            value="${esc(profile.display_name)}"
          >
        </div>

        <div class="field">
          <label>BIO</label>

          <textarea
            id="profileBio"
            maxlength="160"
          >${esc(profile.bio || "")}</textarea>
        </div>

        ${uploadFieldMarkup(
          "profileAvatar",
          "PROFILE IMAGE",
          profile.avatar_url || ""
        )}

        <div class="field">
          <label>PROFILE VISIBILITY</label>

          <select id="profileVisibility">
            <option
              value="public"
              ${profile.visibility === "public" ? "selected" : ""}
            >
              Public
            </option>

            <option
              value="private"
              ${profile.visibility === "private" ? "selected" : ""}
            >
              Private
            </option>
          </select>
        </div>

        <div class="field">
          <label>SEARCH DISCOVERY</label>

          <select id="profileDiscoverable">
            <option
              value="true"
              ${profile.discoverable !== false ? "selected" : ""}
            >
              Allow people to find me
            </option>

            <option
              value="false"
              ${profile.discoverable === false ? "selected" : ""}
            >
              Hide me from people search
            </option>
          </select>
        </div>
      `,
      `
        <button
          class="secondary-button"
          data-action="close-sheet"
        >
          Cancel
        </button>

        <button
          class="primary-button"
          data-action="save-profile"
        >
          Save changes
        </button>
      `
    );
  }

  function setUploadPreview(config, source, isObjectUrl) {
    const preview = $(config.preview);
    const wrapper = $(config.previewWrap);

    if (!preview || !wrapper) return;

    const oldUrl = previewObjectUrls.get(config.preview);

    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
      previewObjectUrls.delete(config.preview);
    }

    preview.src = source || "";
    wrapper.hidden = !source;

    if (source && isObjectUrl) {
      previewObjectUrls.set(config.preview, source);
    }
  }

  function updateUploadStatus(config, text) {
    const status = $(config.status);

    if (status) {
      status.textContent = text || "";
    }
  }

  async function uploadCover(fileInputId, button) {
    const input = $(fileInputId);
    const config = UPLOAD_FIELDS[fileInputId];

    if (!input || !config) {
      throw new Error("Image input is unavailable.");
    }

    const target = $(fileInputId.replace(/File$/, ""));

    const file = input.files?.[0];

    if (!file || !target) {
      throw new Error("Choose an image first.");
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw new Error("Use a JPG, PNG or WebP image.");
    }

    if (file.size <= 0) {
      throw new Error("Selected image is empty.");
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new Error("Image must be 5 MB or smaller.");
    }

    const form = new FormData();

    form.append(
      "fileToUpload",
      file,
      file.name || "taalune-cover"
    );

    const progress = $(config.progress);
    const progressWrap = $(config.progressWrap);
    const originalText = button?.innerHTML || "";

    if (progressWrap) progressWrap.hidden = false;
    if (progress) progress.value = 0;

    updateUploadStatus(config, "Preparing upload…");

    if (button) {
      button.disabled = true;
      button.textContent = "Uploading…";
    }

    try {
      const result = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.open(
          "POST",
          "/api/upload/cover",
          true
        );

        xhr.setRequestHeader(
          "X-Telegram-Init-Data",
          initData
        );

        xhr.timeout = 50000;

        xhr.upload.addEventListener("progress", event => {
          if (!event.lengthComputable) {
            updateUploadStatus(
              config,
              "Uploading image…"
            );
            return;
          }

          const percent = Math.min(
            100,
            Math.round(event.loaded / event.total * 100)
          );

          if (progress) {
            progress.value = percent;
          }

          updateUploadStatus(
            config,
            `Uploading… ${percent}%`
          );
        });

        xhr.addEventListener("load", () => {
          let data;

          try {
            data = JSON.parse(xhr.responseText || "{}");
          } catch (_) {
            reject(
              new Error("Upload server returned invalid JSON.")
            );
            return;
          }

          if (
            xhr.status < 200 ||
            xhr.status >= 300 ||
            data.ok !== true
          ) {
            const code = data.error || "";

            reject(
              new Error(
                API_MESSAGES[code] ||
                data.message ||
                code ||
                `Upload failed (${xhr.status}).`
              )
            );

            return;
          }

          if (
            typeof data.url !== "string" ||
            data.url.length > 2048
          ) {
            reject(
              new Error("Catbox did not return a valid image URL.")
            );
            return;
          }

          let parsed;

          try {
            parsed = new URL(data.url);
          } catch (_) {
            reject(
              new Error("Catbox returned an invalid URL.")
            );
            return;
          }

          if (
            parsed.protocol !== "https:" ||
            parsed.hostname !== "files.catbox.moe" ||
            parsed.username ||
            parsed.password ||
            parsed.search ||
            parsed.hash ||
            !parsed.pathname.startsWith("/")
          ) {
            reject(
              new Error("Catbox returned an invalid image URL.")
            );
            return;
          }

          resolve(data);
        });

        xhr.addEventListener("error", () => {
          reject(
            new Error("Network error while uploading to Catbox.")
          );
        });

        xhr.addEventListener("abort", () => {
          reject(new Error("Image upload was cancelled."));
        });

        xhr.addEventListener("timeout", () => {
          reject(
            new Error("Image upload timed out. Try again.")
          );
        });

        // Do not set multipart Content-Type manually.
        // Browser must generate the multipart boundary.
        xhr.send(form);
      });

      target.value = result.url;

      setUploadPreview(
        config,
        result.url,
        false
      );

      if (progress) progress.value = 100;

      updateUploadStatus(
        config,
        "Upload complete."
      );

      input.value = "";

      showToast("Image uploaded successfully");

      return result.url;

    } catch (error) {
      updateUploadStatus(
        config,
        error.message || "Upload failed."
      );

      throw error;

    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = originalText;
      }
    }
  }

  async function inviteSheet() {
    if (!state.activePlaylist) return;

    openSheet(
      "Invite collaborator",
      `
        <div class="field">
          <label>SEARCH PEOPLE</label>

          <input
            id="inviteSearch"
            maxlength="64"
            placeholder="Name or username"
          >
        </div>

        <div id="invitePeople" class="list">
          <div class="empty">
            Type at least two characters.
          </div>
        </div>

        <div class="field">
          <label>COLLABORATOR ROLE</label>

          <select id="inviteRole">
            <option value="editor">
              Editor · add, remove and reorder
            </option>

            <option value="contributor">
              Contributor · add songs
            </option>

            <option value="viewer">
              Viewer · view and play
            </option>
          </select>
        </div>

        <div class="field">
          <label>PLAYLIST</label>

          <input
            id="invitePlaylist"
            value="${esc(state.activePlaylist.name)}"
            disabled
          >
        </div>
      `,
      `
        <button
          class="secondary-button"
          data-action="close-sheet"
        >
          Cancel
        </button>

        <button
          class="primary-button"
          data-action="send-invite"
          id="sendInviteButton"
          disabled
        >
          Send invite
        </button>
      `
    );
  }

  async function searchInvitePeople() {
    const input = $("inviteSearch");
    const target = $("invitePeople");
    const send = $("sendInviteButton");

    if (!input || !target) return;

    const query = input.value.trim();

    if (query.length < 2) {
      target.innerHTML =
        '<div class="empty">Type at least two characters.</div>';

      state.selectedInvite = null;

      if (send) send.disabled = true;

      return;
    }

    try {
      const data = await api(
        `/api/search/people?q=${encodeURIComponent(query)}&limit=15`
      );

      state.modalPeople = data.results || [];

      target.innerHTML = state.modalPeople.length
        ? state.modalPeople.map(person => `
            <button
              class="person-row"
              data-action="select-invitee"
              data-id="${esc(person.user_id)}"
              style="width:100%;text-align:left"
            >
              ${image(person.avatar_url, "person-avatar")}

              <span class="grow">
                <span class="track-title">
                  ${esc(person.display_name)}
                </span>

                <span class="track-sub">
                  @${esc(person.handle)}
                </span>
              </span>

              ${Number(state.selectedInvite) === Number(person.user_id)
                ? icon("check", 17)
                : icon("plus", 17)}
            </button>
          `).join("")
        : '<div class="empty">No people found.</div>';

      if (send) {
        send.disabled = !state.selectedInvite;
      }

    } catch (error) {
      target.innerHTML =
        `<div class="empty">${esc(error.message)}</div>`;
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

    if (
      from < 0 ||
      to < 0 ||
      to >= tracks.length
    ) {
      return;
    }

    [tracks[from], tracks[to]] = [
      tracks[to],
      tracks[from]
    ];

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

  async function savePlaylist() {
    const name = $("newPlaylistName").value.trim();

    if (!name) {
      throw new Error("Enter a playlist name.");
    }

    const body = {
      name,
      description: $("newPlaylistDescription").value,
      visibility: $("newPlaylistVisibility").value,
      cover_url: $("newPlaylistCover").value || null,
      icon: $("newPlaylistIcon").value || "music"
    };

    const result = await api(
      "/api/playlists",
      {
        method: "POST",
        body: JSON.stringify(body)
      }
    );

    closeSheet();

    state.playlists.unshift(result.playlist);

    showToast("Playlist created");

    await openPlaylist(result.playlist.id);

    if (state.page === "home") {
      state.homeFeedLoadedAt = 0;
    }
  }

  async function savePlaylistEdit() {
    const playlist = state.activePlaylist;

    if (!playlist) {
      throw new Error("Playlist is not open.");
    }

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

    state.homeFeedLoadedAt = 0;
  }

  async function saveProfile() {
    const body = {
      handle: $("profileHandle").value,
      display_name: $("profileName").value,
      bio: $("profileBio").value,
      avatar_url: $("profileAvatar").value || null,
      visibility: $("profileVisibility").value,
      discoverable: $("profileDiscoverable").value === "true"
    };

    const data = await api(
      "/api/profile",
      {
        method: "PATCH",
        body: JSON.stringify(body)
      }
    );

    state.profile = data.profile;

    setAvatar();

    closeSheet();

    renderProfile();

    showToast("Profile updated");
  }

  async function addTrackToPlaylist(track, playlistId) {
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

    showToast("Song added to playlist");

    if (state.activePlaylist?.id === playlistId) {
      await reloadActivePlaylist();
    }

    if (state.page === "home") {
      state.homeFeedLoadedAt = 0;
    }
  }

  async function confirmAddTrack() {
    const playlistId = $("targetPlaylist")?.value;

    if (!playlistId || !state.modalTrack) {
      throw new Error("Choose a playlist first.");
    }

    await addTrackToPlaylist(
      state.modalTrack,
      playlistId
    );

    closeSheet();

    await loadPersonalPlaylists();
  }

  async function loadPersonalPlaylists() {
    const data = await api(
      "/api/playlists?scope=mine&limit=50"
    );

    state.playlists = data.results || [];
  }

  async function togglePlaylistFollow(id) {
    const data = await api(
      `/api/playlists/${encodeURIComponent(id)}`
    );

    const playlist = data.playlist;

    await api(
      `/api/playlists/${encodeURIComponent(id)}/follow`,
      {
        method: playlist.followed ? "DELETE" : "POST"
      }
    );

    showToast(
      playlist.followed
        ? "Playlist unfollowed"
        : "Playlist followed"
    );

    if (state.activePlaylist?.id === id) {
      await reloadActivePlaylist();
    }

    if (state.page === "home") {
      state.homeFeedLoadedAt = 0;
      await loadHome(true);
    }

    if (state.page === "library") {
      await renderLibraryItems();
    }
  }

  async function togglePlaylistLike() {
    const playlist = state.activePlaylist;

    if (!playlist) return;

    await api(
      `/api/playlists/${encodeURIComponent(playlist.id)}/like`,
      {
        method: playlist.liked ? "DELETE" : "POST"
      }
    );

    await reloadActivePlaylist();
  }

  async function deletePlaylist() {
    const playlist = state.activePlaylist;

    if (!playlist) return;

    if (!confirm("Delete this playlist?")) {
      return;
    }

    await api(
      `/api/playlists/${encodeURIComponent(playlist.id)}`,
      { method: "DELETE" }
    );

    state.activePlaylist = null;
    state.homeFeedLoadedAt = 0;

    showToast("Playlist deleted");

    setPage("library");
    await renderLibraryItems();
  }

  async function followPerson(button) {
    const id = button.dataset.id;
    const previous = button.dataset.state || "";

    if (!id) return;

    if (previous === "accepted" || previous === "pending") {
      await api(
        `/api/people/${encodeURIComponent(id)}/follow`,
        { method: "DELETE" }
      );

      button.dataset.state = "";
      button.textContent = "Follow";

      showToast(
        previous === "pending"
          ? "Follow request cancelled"
          : "Unfollowed"
      );

    } else {
      const data = await api(
        `/api/people/${encodeURIComponent(id)}/follow`,
        { method: "POST" }
      );

      button.dataset.state = data.status || "";
      button.textContent =
        data.status === "pending" ? "Requested" : "Following";

      showToast(
        data.status === "pending"
          ? "Follow request sent"
          : "Following"
      );
    }
  }

  async function respondFollow(button) {
    await api(
      `/api/people/${encodeURIComponent(button.dataset.id)}/follow-response`,
      {
        method: "POST",
        body: JSON.stringify({
          action: button.dataset.choice
        })
      }
    );

    showToast("Follow request updated");

    await loadNotifications();
  }

  async function respondInvitation(button) {
    await api(
      `/api/invitations/${encodeURIComponent(button.dataset.id)}/respond`,
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
  }

  async function markNotificationRead(button) {
    await api(
      `/api/notifications/${encodeURIComponent(button.dataset.id)}/read`,
      { method: "POST" }
    );

    button.closest(".notification")?.classList.remove("unread");
    button.innerHTML = icon("check", 16);

    const unread = document.querySelector(
      ".notification.unread"
    );

    $("notificationDot").hidden = !unread;
  }

  async function changeCollaboratorRole(id) {
    const role = prompt(
      "Choose: editor, contributor or viewer",
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
  }

  async function removeCollaborator(id) {
    if (!confirm("Remove this collaborator?")) {
      return;
    }

    await api(
      `/api/playlists/${encodeURIComponent(state.activePlaylist.id)}/collaborators/${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );

    await reloadActivePlaylist();

    showToast("Collaborator removed");
  }

  async function sendInvitation() {
    if (!state.selectedInvite) {
      throw new Error("Choose a person first.");
    }

    if (!state.activePlaylist) {
      throw new Error("Playlist is not open.");
    }

    await api(
      `/api/playlists/${encodeURIComponent(state.activePlaylist.id)}/invitations`,
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
  }

  async function toggleProfilePrivacy() {
    const visibility = state.profile.visibility === "public"
      ? "private"
      : "public";

    const data = await api(
      "/api/profile",
      {
        method: "PATCH",
        body: JSON.stringify({ visibility })
      }
    );

    state.profile = data.profile;

    renderProfile();

    showToast("Profile privacy updated");
  }

  // -------------------------------------------------------
  // Telegram group player
  // -------------------------------------------------------

  async function restoreSelectedGroup() {
    try {
      const saved = localStorage.getItem(
        "taalune.selectedGroup"
      );

      if (!saved || !/^-100\d{6,13}$/.test(saved)) {
        return;
      }

      const chatId = Number(saved);

      if (!Number.isSafeInteger(chatId)) {
        localStorage.removeItem("taalune.selectedGroup");
        return;
      }

      const data = await api(
        `/api/groups/${encodeURIComponent(chatId)}/status`
      );

      state.selectedGroup = {
        chat_id: chatId,
        title: data.group.title
      };

      state.groupStatus = data.group;

    } catch (_) {
      state.selectedGroup = null;
      state.groupStatus = null;

      try {
        localStorage.removeItem("taalune.selectedGroup");
      } catch (_) {}
    }
  }

  function renderGroups() {
    const preset =
      new URLSearchParams(location.search).get("chat_id") || "";

    const value =
      state.selectedGroup?.chat_id || preset;

    $("page-groups").innerHTML = `
      <div class="eyebrow">Telegram voice chats</div>

      <h1 class="page-title">Group player</h1>

      <p class="muted small">
        Connect your Telegram supergroup to control its voice-chat music.
        Personal listening stays separate from group playback.
      </p>

      <div class="search-box" style="margin-top:17px">
        ${icon("users", 18)}

        <input
          id="groupIdInput"
          inputmode="numeric"
          placeholder="Supergroup ID · -100…"
          value="${esc(value)}"
        >
      </div>

      <div class="detail-actions">
        <button class="primary-button" data-action="check-group">
          Connect group
        </button>

        ${state.selectedGroup ? `
          <button
            class="secondary-button"
            data-action="disconnect-group"
          >
            Disconnect
          </button>
        ` : ""}
      </div>

      <div id="groupStatusPanel" style="margin-top:18px">
        <div class="empty">
          ${state.selectedGroup
            ? "Checking selected group…"
            : "Enter a supergroup ID to connect."}
        </div>
      </div>
    `;

    if (!state.selectedGroup) return;

    if (
      state.groupStatus &&
      String(state.groupStatus.chat_id) ===
        String(state.selectedGroup.chat_id)
    ) {
      renderGroupStatus(state.groupStatus);

    } else {
      refreshGroupStatus().catch(error => {
        const panel = $("groupStatusPanel");

        if (panel) {
          panel.innerHTML =
            `<div class="empty group-error">${esc(error.message)}</div>`;
        }
      });
    }
  }

  function renderGroupStatus(group) {
    const panel = $("groupStatusPanel");
    if (!panel) return;

    const current = group.current;

    panel.innerHTML = `
      <div class="group-panel">
        <div class="eyebrow">Connected group</div>

        <div class="row" style="margin-top:8px">
          <div class="grow">
            <div class="track-title" style="font-size:16px">
              ${esc(group.title)}
            </div>

            <div class="track-sub">
              Group ID: ${esc(group.chat_id)}
            </div>

            <div class="track-sub">
              Assistant: ${esc(group.assistant_id)}
            </div>

            <div class="track-sub">
              You: ${esc(group.user_status)}
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
          ${image(current.thumbnail, "track-cover")}

          <div class="track-copy">
            <div class="track-title">
              ${esc(current.title)}
            </div>

            <div class="track-sub">
              ${esc(current.artist)}
              · ${formatTime(current.duration_sec)}
            </div>
          </div>
        </div>
      ` : `
        <div class="empty">
          Nothing is playing in this group.
        </div>
      `}

      ${group.can_control ? `
        <div class="detail-actions">
          ${group.active ? `
            <button
              class="secondary-button"
              data-action="group-control"
              data-command="${group.playing ? "pause" : "resume"}"
            >
              ${icon(group.playing ? "pause" : "play", 15)}
              ${group.playing ? "Pause" : "Resume"}
            </button>

            <button
              class="secondary-button"
              data-action="group-control"
              data-command="skip"
            >
              ${icon("next", 15)}
              Next
            </button>

            <button
              class="danger-button"
              data-action="group-control"
              data-command="stop"
            >
              ${icon("close", 15)}
              Stop
            </button>
          ` : `
            <span class="muted small">
              Search for a song or open a playlist to start group playback.
            </span>
          `}

          <button
            class="secondary-button"
            data-action="refresh-group"
          >
            ${icon("refresh", 15)}
            Refresh
          </button>
        </div>
      ` : `
        <div class="empty">
          You can view group status, but only group admins or authorized
          users can control playback.
        </div>

        <button
          class="secondary-button"
          data-action="refresh-group"
        >
          ${icon("refresh", 15)}
          Refresh
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
            ${image(track.thumbnail, "track-cover")}

            <div class="track-copy">
              <div class="track-title">
                ${esc(track.title)}
              </div>

              <div class="track-sub">
                ${esc(track.artist)}
                · ${formatTime(track.duration_sec)}
              </div>
            </div>
          </div>
        `).join("") || `
          <div class="empty">
            The group queue is empty.
          </div>
        `}
      </div>
    `;
  }

  async function refreshGroupStatus() {
    if (!state.selectedGroup) {
      throw new Error("Connect a group first.");
    }

    const chatId = state.selectedGroup.chat_id;

    const data = await api(
      `/api/groups/${encodeURIComponent(chatId)}/status`
    );

    if (
      !state.selectedGroup ||
      Number(state.selectedGroup.chat_id) !== Number(chatId)
    ) {
      return null;
    }

    state.groupStatus = data.group;

    renderGroupStatus(data.group);

    return data.group;
  }

  async function connectGroup() {
    const input = $("groupIdInput");
    const raw = input?.value.trim() || "";

    if (!/^-100\d{6,13}$/.test(raw)) {
      showToast(
        "Enter a valid Telegram supergroup ID starting with -100."
      );
      return;
    }

    const chatId = Number(raw);

    if (!Number.isSafeInteger(chatId)) {
      showToast("This group ID is not supported.");
      return;
    }

    const panel = $("groupStatusPanel");

    if (panel) {
      panel.innerHTML = `
        <div class="empty">
          Verifying group membership and playback assistant…
        </div>
      `;
    }

    state.selectedGroup = {
      chat_id: chatId
    };

    state.groupStatus = null;

    try {
      const group = await refreshGroupStatus();

      if (!group) {
        throw new Error("Unable to verify selected group.");
      }

      state.selectedGroup.title = group.title;

      try {
        localStorage.setItem(
          "taalune.selectedGroup",
          String(chatId)
        );
      } catch (_) {}

      refreshTrackActions();

      showToast("Group connected successfully");

      renderGroups();

    } catch (error) {
      state.selectedGroup = null;
      state.groupStatus = null;

      try {
        localStorage.removeItem("taalune.selectedGroup");
      } catch (_) {}

      if (panel) {
        panel.innerHTML =
          `<div class="empty group-error">${esc(error.message)}</div>`;
      }

      showToast(error.message);
    }
  }

  function disconnectGroup() {
    state.selectedGroup = null;
    state.groupStatus = null;

    try {
      localStorage.removeItem("taalune.selectedGroup");
    } catch (_) {}

    refreshTrackActions();

    if (state.page === "groups") {
      renderGroups();
    }

    showToast("Group disconnected");
  }

  function refreshTrackActions() {
    const home = $("homeTracks");

    if (home && state.homeTracks.length) {
      refreshHomeTrackRows();
    }

    if (
      state.page === "search" &&
      state.searchMode === "music"
    ) {
      renderSearchResults();
    }

    if (state.page === "playlist") {
      renderPlaylist();
    }

    if (
      state.page === "library" &&
      state.libraryScope === "liked"
    ) {
      renderLibraryItems();
    }
  }

  async function groupControl(action, payload = {}) {
    if (!state.selectedGroup) {
      throw new Error("Connect a group first.");
    }

    const chatId = state.selectedGroup.chat_id;

    const data = await api(
      `/api/groups/${encodeURIComponent(chatId)}/control`,
      {
        method: "POST",
        body: JSON.stringify({
          action,
          ...payload
        })
      }
    );

    if (data.status === "queued") {
      showToast(
        `Added to group queue${
          data.position !== undefined
            ? ` · position ${Number(data.position) + 1}`
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

  function trackPayload(track) {
    return {
      id: track.id,
      title: track.title,
      artist: track.artist || "Unknown artist",
      duration_sec: Number(track.duration_sec || 0),
      thumbnail: track.thumbnail || null
    };
  }

  async function groupTrack(track, playNow) {
    if (!state.selectedGroup) {
      throw new Error("Connect a group first.");
    }

    if (!track?.id) {
      throw new Error("Song details are unavailable.");
    }

    await groupControl(
      playNow ? "play_track" : "queue_track",
      {
        track: trackPayload(track)
      }
    );
  }

  // -------------------------------------------------------
  // Personal audio player
  // -------------------------------------------------------

  function resetShuffleBag() {
    state.shuffleBag = [];

    if (!state.queue.length) return;

    state.shuffleBag = state.queue
      .map((_, index) => index)
      .filter(index => index !== state.queueIndex);

    for (let index = state.shuffleBag.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));

      [
        state.shuffleBag[index],
        state.shuffleBag[other]
      ] = [
        state.shuffleBag[other],
        state.shuffleBag[index]
      ];
    }
  }

  function pickShuffleIndex() {
    if (state.queue.length <= 1) {
      return state.queueIndex;
    }

    if (!state.shuffleBag.length) {
      resetShuffleBag();
    }

    if (!state.shuffleBag.length) {
      return state.queueIndex;
    }

    return state.shuffleBag.pop();
  }

  function updateRepeatButton() {
    const button = $("repeatButton");
    if (!button) return;

    button.classList.toggle(
      "active",
      state.repeatMode !== 0
    );

    button.dataset.mode = String(state.repeatMode);

    button.setAttribute(
      "aria-label",
      [
        "Repeat off",
        "Repeat all",
        "Repeat one"
      ][state.repeatMode]
    );

    button.title = [
      "Repeat off",
      "Repeat all",
      "Repeat one"
    ][state.repeatMode];
  }

  function updatePlayer() {
    const track = state.currentTrack;

    const mini = $("miniPlayer");

    if (!track) {
      mini.classList.remove("visible");

      $("miniToggle").innerHTML = icon("play", 18);
      $("fullToggle").innerHTML = icon("play", 24);

      $("miniTitle").textContent = "Nothing playing";
      $("miniArtist").textContent = "Choose a song";

      $("elapsed").textContent = "0:00";
      $("remaining").textContent = "--:--";
      $("miniProgress").style.width = "0%";
      $("seek").value = "0";

      return;
    }

    mini.classList.add("visible");

    $("miniCover").src = track.thumbnail || "";
    $("miniTitle").textContent = track.title || "Unknown title";
    $("miniArtist").textContent = track.artist || "Unknown artist";

    $("fullCover").src = track.thumbnail || "";
    $("fullTitle").textContent = track.title || "Unknown title";
    $("fullArtist").textContent = track.artist || "Unknown artist";

    $("miniToggle").innerHTML = audio.paused
      ? icon("play", 18)
      : icon("pause", 18);

    $("fullToggle").innerHTML = audio.paused
      ? icon("play", 24)
      : icon("pause", 24);

    const likeButton = document.querySelector(
      '[data-action="like-current"]'
    );

    if (likeButton) {
      const liked = isTrackLiked(track.id);

      likeButton.innerHTML = icon(
        liked ? "heartFill" : "heart",
        19
      );

      likeButton.setAttribute(
        "aria-pressed",
        liked ? "true" : "false"
      );
    }

    const duration = getTrackDuration(track);
    const current = Number(audio.currentTime) || 0;

    $("elapsed").textContent = formatTime(current);

    $("remaining").textContent = duration > 0
      ? `-${formatTime(Math.max(0, duration - current))}`
      : "--:--";
  }

  function updateProgress() {
    const track = state.currentTrack;
    if (!track) return;

    const duration = getTrackDuration(track);
    const current = Number(audio.currentTime) || 0;

    const progress = duration > 0
      ? Math.min(1, Math.max(0, current / duration))
      : 0;

    $("miniProgress").style.width =
      `${progress * 100}%`;

    $("seek").value = String(
      Math.round(progress * 1000)
    );

    $("elapsed").textContent = formatTime(current);

    $("remaining").textContent = duration > 0
      ? `-${formatTime(Math.max(0, duration - current))}`
      : "--:--";
  }

  async function recordListening(track) {
    if (!track?.id) return;

    const id = String(track.id);
    const now = Date.now();

    if (
      state.lastHistoryTrackId === id &&
      now - state.lastHistoryAt < 30000
    ) {
      return;
    }

    state.lastHistoryTrackId = id;
    state.lastHistoryAt = now;

    try {
      await api(
        "/api/listening/history",
        {
          method: "POST",
          body: JSON.stringify({
            id: track.id,
            title: track.title || "Unknown title",
            artist: track.artist || "Unknown artist",
            duration_sec: Number(track.duration_sec || 0),
            thumbnail: track.thumbnail || null
          })
        }
      );
    } catch (error) {
      console.warn(
        "Could not save listening history:",
        error.message
      );
    }
  }

  async function playTrack(
    track,
    list = null,
    index = 0,
    resumeAt = 0
  ) {
    if (!track?.id) return;

    const requestId = ++state.playbackRequest;

    const nextQueue = Array.isArray(list)
      ? list.slice()
      : [track];

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
    state.playbackLoading = true;

    resetShuffleBag();

    // Stop and detach the previous source immediately.
    // Old asynchronous requests must never pause the new player.
    audio.pause();
    audio.removeAttribute("src");
    audio.load();

    updatePlayer();

    try {
      const token = await api(
        "/api/stream-token",
        {
          method: "POST",
          body: JSON.stringify({
            video_id: track.id
          })
        }
      );

      if (requestId !== state.playbackRequest) {
        return;
      }

      if (
        typeof token.stream_url !== "string" ||
        !token.stream_url
      ) {
        throw new Error(
          "Audio server returned an invalid stream URL."
        );
      }

      audio.src = token.stream_url;
      audio.load();

      if (resumeAt > 0) {
        await waitForMetadata(requestId);

        if (requestId !== state.playbackRequest) {
          return;
        }

        const duration = Number(audio.duration);

        audio.currentTime =
          Number.isFinite(duration) && duration > 0
            ? Math.min(
                resumeAt,
                Math.max(0, duration - .25)
              )
            : resumeAt;
      }

      if (requestId !== state.playbackRequest) {
        return;
      }

      await audio.play();

      if (requestId !== state.playbackRequest) {
        return;
      }

      state.playbackLoading = false;

      state.currentTrack = {
        ...track,
        stream_url: token.stream_url
      };

      state.queue[state.queueIndex] = state.currentTrack;

      updatePlayer();
      setMediaSession();

      await recordListening(state.currentTrack);

    } catch (error) {
      if (requestId !== state.playbackRequest) {
        return;
      }

      state.playbackLoading = false;

      if (error?.name === "AbortError") {
        return;
      }

      console.error(
        "Taalune playback failed:",
        error
      );

      showToast(
        error.message || "Unable to start this song."
      );

      updatePlayer();
    }
  }

  function waitForMetadata(requestId) {
    if (requestId !== state.playbackRequest) {
      return Promise.reject(
        new DOMException(
          "Playback request replaced",
          "AbortError"
        )
      );
    }

    if (audio.readyState >= 1) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      let timer;

      const cleanup = () => {
        clearTimeout(timer);

        audio.removeEventListener(
          "loadedmetadata",
          onLoaded
        );

        audio.removeEventListener(
          "error",
          onError
        );
      };

      const onLoaded = () => {
        cleanup();

        if (requestId !== state.playbackRequest) {
          reject(
            new DOMException(
              "Playback request replaced",
              "AbortError"
            )
          );
          return;
        }

        resolve();
      };

      const onError = () => {
        cleanup();

        reject(
          new Error("Audio metadata could not load.")
        );
      };

      audio.addEventListener(
        "loadedmetadata",
        onLoaded
      );

      audio.addEventListener(
        "error",
        onError
      );

      timer = setTimeout(() => {
        cleanup();

        reject(
          new Error("Audio source took too long to load.")
        );
      }, 12000);
    });
  }

  function setMediaSession() {
    if (
      !("mediaSession" in navigator) ||
      !state.currentTrack
    ) {
      return;
    }

    const track = state.currentTrack;

    try {
      if ("MediaMetadata" in window) {
        navigator.mediaSession.metadata =
          new MediaMetadata({
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
      }

      navigator.mediaSession.setActionHandler(
        "play",
        togglePlay
      );

      navigator.mediaSession.setActionHandler(
        "pause",
        () => {
          audio.pause();
          updatePlayer();
        }
      );

      navigator.mediaSession.setActionHandler(
        "nexttrack",
        nextTrack
      );

      navigator.mediaSession.setActionHandler(
        "previoustrack",
        previousTrack
      );

    } catch (_) {}
  }

  async function togglePlay() {
    if (
      !state.currentTrack ||
      state.playbackLoading
    ) {
      return;
    }

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

      if (requestId !== state.playbackRequest) {
        return;
      }

      updatePlayer();
      setMediaSession();

    } catch (error) {
      if (requestId !== state.playbackRequest) {
        return;
      }

      if (error?.name === "AbortError") {
        return;
      }

      const position = Number(audio.currentTime) || 0;

      await playTrack(
        state.currentTrack,
        state.queue,
        state.queueIndex,
        position
      );
    }
  }

  function clearPersonalPlayer() {
    ++state.playbackRequest;

    state.playbackLoading = false;

    audio.pause();
    audio.removeAttribute("src");
    audio.load();

    state.currentTrack = null;
    state.queue = [];
    state.queueIndex = -1;
    state.shuffleBag = [];

    updatePlayer();
  }

  async function nextTrack() {
    if (!state.queue.length) return;

    let nextIndex = -1;

    if (state.shuffle && state.queue.length > 1) {
      nextIndex = pickShuffleIndex();

    } else if (state.queueIndex + 1 < state.queue.length) {
      nextIndex = state.queueIndex + 1;

    } else if (state.repeatMode === 1) {
      nextIndex = 0;
    }

    if (
      nextIndex < 0 ||
      nextIndex >= state.queue.length
    ) {
      clearPersonalPlayer();
      return;
    }

    await playTrack(
      state.queue[nextIndex],
      state.queue,
      nextIndex
    );
  }

  async function previousTrack() {
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    if (state.queueIndex > 0) {
      const previous = state.queueIndex - 1;

      await playTrack(
        state.queue[previous],
        state.queue,
        previous
      );

    } else if (state.repeatMode === 1 && state.queue.length) {
      const previous = state.queue.length - 1;

      await playTrack(
        state.queue[previous],
        state.queue,
        previous
      );
    }
  }

  function openQueue() {
    $("queueCaption").textContent = state.currentTrack
      ? `Playing ${state.currentTrack.title}`
      : "Nothing playing";

    const target = $("queueItems");

    target.innerHTML = state.queue.length
      ? state.queue.map((track, index) => `
          <div class="track-row ${
            index === state.queueIndex ? "queue-current" : ""
          }">
            ${image(track.thumbnail, "track-cover")}

            <div class="track-copy">
              <div class="track-title">
                ${index === state.queueIndex ? "▶ " : ""}
                ${esc(track.title)}
              </div>

              <div class="track-sub">
                ${esc(track.artist || "Unknown artist")}
                · ${formatTime(track.duration_sec)}
              </div>
            </div>

            <button
              class="track-action"
              data-action="queue-play"
              data-index="${index}"
              aria-label="Play song"
            >
              ${icon("play", 16)}
            </button>

            <button
              class="track-action"
              data-action="queue-remove"
              data-index="${index}"
              aria-label="Remove song"
            >
              ${icon("trash", 16)}
            </button>
          </div>
        `).join("")
      : '<div class="empty">Your personal queue is empty.</div>';

    $("queueOverlay").classList.add("open");
  }

  async function removeQueueItem(index) {
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= state.queue.length
    ) {
      return;
    }

    if (index === state.queueIndex) {
      if (state.queue.length === 1) {
        clearPersonalPlayer();
        openQueue();
        return;
      }

      const nextIndex =
        index < state.queue.length - 1
          ? index + 1
          : index - 1;

      const next = state.queue[nextIndex];

      state.queue.splice(index, 1);

      const adjustedIndex =
        nextIndex > index
          ? nextIndex - 1
          : nextIndex;

      await playTrack(
        next,
        state.queue,
        adjustedIndex
      );

    } else {
      state.queue.splice(index, 1);

      if (index < state.queueIndex) {
        state.queueIndex--;
      }

      resetShuffleBag();
    }

    openQueue();
  }

  function setRepeatMode() {
    state.repeatMode = (state.repeatMode + 1) % 3;

    updateRepeatButton();

    showToast([
      "Repeat off",
      "Repeat all",
      "Repeat one"
    ][state.repeatMode]);
  }

  function setShuffle() {
    state.shuffle = !state.shuffle;

    $("shuffleButton").classList.toggle(
      "active",
      state.shuffle
    );

    if (state.shuffle) {
      resetShuffleBag();
    }

    showToast(
      state.shuffle
        ? "Shuffle enabled"
        : "Shuffle disabled"
    );
  }

  // -------------------------------------------------------
  // UI actions
  // -------------------------------------------------------

  document.addEventListener("click", async event => {
    const pageButton = event.target.closest("[data-page]");

    if (pageButton) {
      const page = pageButton.dataset.page;

      if (page) {
        setPage(page);
      }

      return;
    }

    const searchModeButton =
      event.target.closest("[data-search-mode]");

    if (searchModeButton) {
      setSearchMode(
        searchModeButton.dataset.searchMode
      );
      return;
    }

    const libraryButton =
      event.target.closest("[data-library-scope]");

    if (libraryButton) {
      await showLibraryScope(
        libraryButton.dataset.libraryScope
      );
      return;
    }

    const actionButton =
      event.target.closest("[data-action]");

    if (!actionButton) return;

    const action = actionButton.dataset.action;
    const id = actionButton.dataset.id;

    try {
      if (action === "notifications") {
        setPage("notifications");

      } else if (action === "create-playlist") {
        createPlaylistSheet();

      } else if (action === "refresh-home") {
        state.homeLoadedAt = 0;
        state.homeFeedLoadedAt = 0;

        await loadHome(true);

      } else if (action === "open-discover") {
        setPage("library");
        await showLibraryScope("discover");

      } else if (action === "close-sheet") {
        closeSheet();

      } else if (action === "close-queue") {
        $("queueOverlay").classList.remove("open");

      } else if (action === "open-playlist") {
        await openPlaylist(id);

      } else if (action === "open-person") {
        await openPerson(
          actionButton.dataset.handle
        );

      } else if (action === "check-group") {
        await connectGroup();

      } else if (action === "disconnect-group") {
        disconnectGroup();

      } else if (action === "refresh-group") {
        await refreshGroupStatus();
        showToast("Group status updated");

      } else if (action === "group-control") {
        await groupControl(
          actionButton.dataset.command
        );

      } else if (
        action === "group-track" ||
        action === "group-play-track"
      ) {
        const track = findTrack(id);

        if (!track) {
          throw new Error(
            "Song details are unavailable. Search again."
          );
        }

        await groupTrack(
          track,
          action === "group-play-track"
        );

      } else if (action === "group-play-playlist") {
        if (!state.activePlaylist) {
          throw new Error("Open a playlist first.");
        }

        await groupControl(
          "play_playlist",
          {
            playlist_id: state.activePlaylist.id
          }
        );

      } else if (action === "group-queue-playlist") {
        if (!state.activePlaylist) {
          throw new Error("Open a playlist first.");
        }

        await groupControl(
          "queue_playlist",
          {
            playlist_id: state.activePlaylist.id
          }
        );

      } else if (action === "play-track") {
        const track = findTrack(id);

        if (!track) {
          throw new Error("Song details are unavailable.");
        }

        let list = [track];

        if (state.page === "playlist") {
          list = state.activePlaylist?.tracks || [track];

        } else if (
          state.page === "library" &&
          state.libraryScope === "liked"
        ) {
          list = state.liked;

        } else if (state.page === "home") {
          list = state.homeTracks;

        } else if (
          state.page === "search" &&
          state.searchMode === "music"
        ) {
          list = state.searchResults;
        }

        const index = Math.max(
          0,
          list.findIndex(
            item => String(item.id) === String(track.id)
          )
        );

        await playTrack(
          track,
          list,
          index
        );

      } else if (action === "add-track") {
        const track = findTrack(id);

        if (!track) {
          throw new Error(
            "Song details are unavailable. Search again."
          );
        }

        if (state.addTargetPlaylist) {
          const playlistId = state.addTargetPlaylist;

          await addTrackToPlaylist(
            track,
            playlistId
          );

          state.addTargetPlaylist = null;

        } else {
          await loadPersonalPlaylists();
          addTrackSheet(track);
        }

      } else if (action === "confirm-add-track") {
        await confirmAddTrack();

      } else if (action === "like-track") {
        const track = findTrack(id);

        if (!track) {
          throw new Error("Song details are unavailable.");
        }

        await toggleTrackLike(track);

      } else if (action === "playlist-follow") {
        await togglePlaylistFollow(id);

      } else if (action === "like-playlist") {
        await togglePlaylistLike();

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
        await savePlaylistEdit();

      } else if (action === "save-playlist") {
        await savePlaylist();

      } else if (action === "add-from-search") {
        if (!state.activePlaylist) return;

        state.addTargetPlaylist =
          state.activePlaylist.id;

        state.searchMode = "music";
        state.searchQuery = "";

        setPage("search");
        renderSearchShell();

        showToast(
          "Search for songs, then tap Add."
        );

      } else if (action === "upload-cover") {
        await uploadCover(
          actionButton.dataset.file,
          actionButton
        );

      } else if (action === "invite-collaborator") {
        await inviteSheet();

      } else if (action === "select-invitee") {
        state.selectedInvite = Number(id);

        document.querySelectorAll(
          '[data-action="select-invitee"]'
        ).forEach(button => {
          button.classList.toggle(
            "queue-current",
            Number(button.dataset.id) ===
              state.selectedInvite
          );
        });

        $("sendInviteButton").disabled =
          !state.selectedInvite;

      } else if (action === "send-invite") {
        await sendInvitation();

      } else if (action === "delete-playlist") {
        await deletePlaylist();

      } else if (action === "follow-person") {
        await followPerson(actionButton);

      } else if (action === "follow-response") {
        await respondFollow(actionButton);

      } else if (action === "invitation") {
        await respondInvitation(actionButton);

      } else if (action === "read-notification") {
        await markNotificationRead(actionButton);

      } else if (action === "edit-profile") {
        editProfileSheet();

      } else if (action === "save-profile") {
        await saveProfile();

      } else if (action === "toggle-profile-privacy") {
        await toggleProfilePrivacy();

      } else if (action === "remove-track") {
        if (!state.activePlaylist) return;

        if (!confirm("Remove this song from the playlist?")) {
          return;
        }

        await api(
          `/api/playlists/${encodeURIComponent(state.activePlaylist.id)}/tracks/${encodeURIComponent(id)}`,
          { method: "DELETE" }
        );

        await reloadActivePlaylist();

        showToast("Song removed");

      } else if (action === "move-track-up") {
        await reorderPlaylist(id, -1);

      } else if (action === "move-track-down") {
        await reorderPlaylist(id, 1);

      } else if (action === "remove-collaborator") {
        await removeCollaborator(id);

      } else if (action === "change-collaborator") {
        await changeCollaboratorRole(id);

      } else if (action === "open-player") {
        if (state.currentTrack) {
          $("fullPlayer").classList.add("open");
        }

      } else if (action === "close-player") {
        $("fullPlayer").classList.remove("open");

      } else if (action === "toggle-play") {
        await togglePlay();

      } else if (action === "next-track") {
        await nextTrack();

      } else if (action === "previous-track") {
        await previousTrack();

      } else if (action === "shuffle") {
        setShuffle();

      } else if (action === "repeat") {
        setRepeatMode();

      } else if (action === "queue") {
        openQueue();

      } else if (action === "queue-play") {
        const index = Number(actionButton.dataset.index);

        if (!state.queue[index]) return;

        await playTrack(
          state.queue[index],
          state.queue,
          index
        );

        $("queueOverlay").classList.remove("open");

      } else if (action === "queue-remove") {
        await removeQueueItem(
          Number(actionButton.dataset.index)
        );

      } else if (action === "like-current") {
        if (state.currentTrack) {
          await toggleTrackLike(state.currentTrack);
        }
      }

    } catch (error) {
      showToast(
        error.message || "Something went wrong."
      );
    }
  });

  // -------------------------------------------------------
  // Input events
  // -------------------------------------------------------

  document.addEventListener("input", event => {
    const target = event.target;

    if (target.id === "searchInput") {
      clearTimeout(searchTimer);

      searchTimer = setTimeout(
        runSearch,
        320
      );
    }

    if (target.id === "inviteSearch") {
      clearTimeout(searchTimer);

      searchTimer = setTimeout(
        searchInvitePeople,
        280
      );
    }
  });

  document.addEventListener("keydown", event => {
    if (
      event.target.id === "searchInput" &&
      event.key === "Enter"
    ) {
      event.preventDefault();

      clearTimeout(searchTimer);
      runSearch();
    }

    if (
      event.target.id === "groupIdInput" &&
      event.key === "Enter"
    ) {
      event.preventDefault();
      connectGroup();
    }
  });

  document.addEventListener("change", event => {
    const input = event.target;

    const config = UPLOAD_FIELDS[input?.id];

    if (
      !config ||
      input.type !== "file"
    ) {
      return;
    }

    const file = input.files?.[0];

    if (!file) {
      setUploadPreview(config, "", false);
      return;
    }

    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    ) {
      input.value = "";

      setUploadPreview(config, "", false);

      showToast("Use a JPG, PNG or WebP image.");
      return;
    }

    if (
      file.size <= 0 ||
      file.size > 5 * 1024 * 1024
    ) {
      input.value = "";

      setUploadPreview(config, "", false);

      showToast(
        file.size > 5 * 1024 * 1024
          ? "Image must be 5 MB or smaller."
          : "Selected image is empty."
      );

      return;
    }

    const oldUrl = previewObjectUrls.get(config.preview);

    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
      previewObjectUrls.delete(config.preview);
    }

    const objectUrl = URL.createObjectURL(file);

    setUploadPreview(
      config,
      objectUrl,
      true
    );

    const progressWrap = $(config.progressWrap);
    const progress = $(config.progress);

    if (progressWrap) progressWrap.hidden = true;
    if (progress) progress.value = 0;

    updateUploadStatus(config, "");
  });

  // -------------------------------------------------------
  // Playlist drag-and-drop reorder
  // -------------------------------------------------------

  document.addEventListener("dragstart", event => {
    const row = event.target.closest(
      ".track-row[draggable='true']"
    );

    if (!row || state.page !== "playlist") return;

    state.dragId = row.dataset.trackId;

    row.classList.add("dragging");

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";

      event.dataTransfer.setData(
        "text/plain",
        state.dragId
      );
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
    event.target
      .closest(".track-row")
      ?.classList.remove("drag-over");
  });

  document.addEventListener("drop", async event => {
    const row = event.target.closest(
      ".track-row[draggable='true']"
    );

    if (
      !row ||
      !state.dragId ||
      !state.activePlaylist
    ) {
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

      document.querySelectorAll(
        ".dragging,.drag-over"
      ).forEach(element => {
        element.classList.remove(
          "dragging",
          "drag-over"
        );
      });
    }
  });

  document.addEventListener("dragend", () => {
    state.dragId = null;

    document.querySelectorAll(
      ".dragging,.drag-over"
    ).forEach(element => {
      element.classList.remove(
        "dragging",
        "drag-over"
      );
    });
  });

  // -------------------------------------------------------
  // Audio element events
  // -------------------------------------------------------

  $("seek").addEventListener("input", () => {
    const duration = Number(audio.duration);

    if (
      Number.isFinite(duration) &&
      duration > 0
    ) {
      audio.currentTime =
        (Number($("seek").value) / 1000) * duration;
    }
  });

  audio.addEventListener("timeupdate", updateProgress);

  audio.addEventListener("loadedmetadata", () => {
    updateProgress();
    updatePlayer();
  });

  audio.addEventListener("play", () => {
    state.playbackLoading = false;
    updatePlayer();
  });

  audio.addEventListener("pause", updatePlayer);

  audio.addEventListener("ended", async () => {
    if (
      state.repeatMode === 2 &&
      state.currentTrack
    ) {
      audio.currentTime = 0;

      try {
        await audio.play();
      } catch (error) {
        showToast(error.message);
      }

      return;
    }

    await nextTrack();
  });

  audio.addEventListener("error", () => {
    if (
      state.currentTrack &&
      !state.playbackLoading &&
      audio.currentSrc
    ) {
      showToast(
        "This audio stream is unavailable. Try playing it again."
      );
    }
  });

  // -------------------------------------------------------
  // Background group status refresh
  // -------------------------------------------------------

  groupRefreshTimer = setInterval(() => {
    if (
      state.page !== "groups" ||
      !state.selectedGroup
    ) {
      return;
    }

    refreshGroupStatus().catch(error => {
      console.warn(
        "Group status refresh failed:",
        error.message
      );
    });
  }, 15000);

  // -------------------------------------------------------
  // Startup
  // -------------------------------------------------------

  async function boot() {
    updateRepeatButton();

    if (tg) {
      try {
        tg.ready();
        tg.expand();

        tg.setHeaderColor("#100d17");
        tg.setBackgroundColor("#100d17");
      } catch (_) {}
    }

    if (!initData) {
      $("mainContent").innerHTML = `
        <div class="empty" style="margin-top:45px">
          Open Taalune from the Telegram bot to sign in securely.
        </div>
      `;

      document.querySelector(".bottom-nav").hidden = true;
      return;
    }

    try {
      await restoreSelectedGroup();

      await loadProfile();

      await Promise.allSettled([
        loadLikedTracks()
      ]);

      await loadHome(true);

    } catch (error) {
      console.error("Taalune startup failed:", error);

      showToast(
        error.message || "Unable to open Taalune."
      );
    }
  }

  boot();
})();