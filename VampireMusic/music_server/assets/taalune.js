
:root {
  color-scheme: dark;

  --bg: #100d17;
  --bg-soft: #15111d;
  --surface: #1b1624;
  --surface-2: #241c2e;
  --surface-3: #30243b;
  --surface-hover: #382943;

  --text: #fbf5fc;
  --muted: #ad9fb6;
  --muted-2: #81738a;

  --line: rgba(233, 200, 231, .10);
  --line-strong: rgba(233, 200, 231, .18);

  --accent: #eab6d8;
  --accent-2: #cb8dbd;
  --accent-dark: #8e5b88;

  --danger: #f18d9c;
  --success: #8ed8bd;
  --warning: #edc98a;

  --radius-sm: 11px;
  --radius-md: 17px;
  --radius-lg: 23px;
  --radius-xl: 29px;

  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);

  --nav-height: 68px;
  --mini-height: 68px;

  --ease: cubic-bezier(.2, .7, .2, 1);
}

* {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

html {
  min-height: 100%;
  scroll-behavior: smooth;
  background: var(--bg);
}

body {
  min-height: 100vh;
  margin: 0;
  padding:
    0
    0
    calc(116px + var(--safe-bottom));

  overflow-x: hidden;
  background:
    radial-gradient(
      ellipse at 50% -15%,
      rgba(177, 112, 171, .17),
      transparent 48%
    ),
    radial-gradient(
      ellipse at 100% 55%,
      rgba(104, 73, 125, .08),
      transparent 44%
    ),
    var(--bg);

  color: var(--text);

  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;

  font-size: 14px;
  line-height: 1.5;
}

button,
input,
textarea,
select {
  font: inherit;
}

button {
  border: 0;
  color: inherit;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;

  transition:
    background-color .16s ease,
    border-color .16s ease,
    color .16s ease,
    opacity .16s ease,
    box-shadow .16s ease;
}

button:disabled {
  opacity: .42;
  cursor: not-allowed;
}

button:focus-visible,
input:focus-visible,
textarea:focus-visible,
select:focus-visible {
  outline: 2px solid var(--accent-2);
  outline-offset: 3px;
}

input,
textarea,
select {
  color: var(--text);
}

input::placeholder,
textarea::placeholder {
  color: var(--muted-2);
}

img {
  display: block;
  max-width: 100%;
}

svg {
  display: block;
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}

[hidden] {
  display: none !important;
}

.app-shell {
  width: min(100%, 820px);
  min-height: 100vh;
  margin: 0 auto;
  padding: 0 17px;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 25;

  height: 72px;
  margin: 0 -17px;
  padding: 0 19px;

  display: flex;
  align-items: center;
  justify-content: space-between;

  background: rgba(16, 13, 23, .90);
  border-bottom: 1px solid rgba(233, 200, 231, .07);
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
}

.brand {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 11px;

  color: var(--text);
  text-decoration: none;
}

.brand-mark {
  width: 39px;
  height: 39px;

  display: grid;
  place-items: center;

  border-radius: 14px;

  background:
    linear-gradient(145deg, #f4d2e9, #c18bb8);

  color: #291a2b;
  font-size: 23px;
  font-weight: 950;

  box-shadow:
    0 5px 24px rgba(201, 141, 185, .20);
}

.brand-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}

.brand-copy strong {
  font-size: 17px;
  letter-spacing: -.4px;
  font-weight: 850;
}

.brand-copy small {
  margin-top: 4px;
  color: var(--muted);
  font-size: 10px;
  letter-spacing: .15px;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 9px;
}

.icon-button {
  width: 41px;
  height: 41px;
  padding: 0;

  display: inline-grid;
  place-items: center;

  border-radius: 50%;
  background: transparent;
  color: var(--text);

  position: relative;
}

.icon-button:hover {
  background: rgba(255, 255, 255, .07);
}

.notification-dot {
  position: absolute;
  top: 7px;
  right: 7px;

  width: 8px;
  height: 8px;

  border-radius: 50%;
  background: var(--danger);
  border: 2px solid var(--bg);
}

.avatar-button {
  width: 39px;
  height: 39px;
  padding: 0;

  display: grid;
  place-items: center;

  position: relative;
  overflow: hidden;

  border-radius: 50%;
  background: var(--surface-3);
}

.avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-fallback {
  position: absolute;
  inset: 0;

  display: grid;
  place-items: center;

  color: var(--accent);
  font-size: 15px;
  font-weight: 800;
}

.page {
  display: none;
  min-width: 0;
  padding: 22px 0 28px;
}

.page.active {
  display: block;
  animation: page-fade .16s ease both;
}

@keyframes page-fade {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

.page-loading {
  min-height: 250px;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;

  color: var(--muted);
}

.loading-orb {
  width: 35px;
  height: 35px;
  border-radius: 50%;

  border: 3px solid rgba(234, 182, 216, .16);
  border-top-color: var(--accent);

  animation: orb-spin .8s linear infinite;
}

@keyframes orb-spin {
  to {
    transform: rotate(360deg);
  }
}

.eyebrow {
  color: var(--muted);
  font-size: 10px;
  font-weight: 850;
  letter-spacing: 1.45px;
  text-transform: uppercase;
}

.page-title {
  margin: 5px 0 9px;

  color: var(--text);
  font-size: clamp(27px, 7vw, 36px);
  font-weight: 900;
  line-height: 1.12;
  letter-spacing: -1.2px;
}

h2,
h3,
p {
  overflow-wrap: anywhere;
}

h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 820;
  letter-spacing: -.35px;
}

h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 800;
}

p {
  margin: 0;
}

.muted {
  color: var(--muted);
}

.small {
  font-size: 11px;
}

.grow {
  flex: 1;
  min-width: 0;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.divider {
  height: 1px;
  margin: 22px 0;
  background: var(--line);
}

.section-head {
  min-width: 0;
  margin: 27px 0 13px;

  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.section-head:first-child {
  margin-top: 0;
}

.section-head button {
  padding: 7px 9px;

  display: inline-flex;
  align-items: center;
  gap: 6px;

  border-radius: 10px;
  background: transparent;
  color: var(--accent);
  font-size: 11px;
  font-weight: 800;
}

.section-head button:hover {
  background: rgba(234, 182, 216, .08);
}

.section-head button svg {
  width: 15px;
  height: 15px;
}

.hero-card {
  position: relative;
  overflow: hidden;

  padding: 24px 21px;
  border: 1px solid rgba(235, 193, 226, .13);
  border-radius: var(--radius-xl);

  background:
    radial-gradient(
      ellipse at 85% 15%,
      rgba(227, 168, 216, .22),
      transparent 42%
    ),
    linear-gradient(
      135deg,
      #2d2037,
      #1d1727 65%,
      #21172c
    );

  box-shadow:
    0 15px 45px rgba(0, 0, 0, .18);
}

.hero-card::after {
  content: "";
  position: absolute;
  right: -44px;
  bottom: -72px;

  width: 190px;
  height: 190px;
  border: 1px solid rgba(242, 198, 229, .11);
  border-radius: 50%;

  box-shadow:
    0 0 0 22px rgba(242, 198, 229, .025),
    0 0 0 45px rgba(242, 198, 229, .02);

  pointer-events: none;
}

.hero-content {
  position: relative;
  z-index: 1;
  max-width: 470px;
}

.hero-card h1 {
  margin: 8px 0 11px;

  font-size: clamp(29px, 8vw, 39px);
  font-weight: 900;
  line-height: 1.06;
  letter-spacing: -1.4px;
}

.hero-card p {
  max-width: 390px;
  color: #c8b9d0;
  font-size: 12px;
  line-height: 1.7;
}

.hero-actions {
  margin-top: 19px;

  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
}

.button,
.primary-button,
.secondary-button,
.danger-button {
  min-height: 42px;
  padding: 0 15px;

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  border: 1px solid transparent;
  border-radius: 13px;

  font-size: 12px;
  font-weight: 820;
  text-decoration: none;
  white-space: nowrap;
}

.primary-button {
  background: linear-gradient(135deg, #f0c8e3, #d69bc8);
  color: #28192a;

  box-shadow:
    0 5px 20px rgba(214, 155, 200, .17);
}

.primary-button:hover {
  filter: brightness(1.06);
}

.secondary-button {
  background: rgba(255, 255, 255, .045);
  border-color: var(--line-strong);
  color: var(--text);
}

.secondary-button:hover {
  background: rgba(255, 255, 255, .085);
}

.danger-button {
  background: rgba(241, 141, 156, .10);
  border-color: rgba(241, 141, 156, .2);
  color: var(--danger);
}

.primary-button svg,
.secondary-button svg,
.danger-button svg {
  width: 16px;
  height: 16px;
}

.pill-row {
  display: flex;
  align-items: center;
  gap: 8px;

  overflow-x: auto;
  padding: 2px 1px 7px;

  scrollbar-width: none;
}

.pill-row::-webkit-scrollbar {
  display: none;
}

.pill {
  flex: 0 0 auto;

  min-height: 34px;
  padding: 0 13px;

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;

  border: 1px solid var(--line);
  border-radius: 999px;

  background: rgba(255, 255, 255, .035);
  color: var(--muted);

  font-size: 11px;
  font-weight: 800;
}

.pill.active {
  background: rgba(234, 182, 216, .15);
  border-color: rgba(234, 182, 216, .34);
  color: var(--accent);
}

.pill svg {
  width: 14px;
  height: 14px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.playlist-card {
  min-width: 0;
  overflow: hidden;

  padding: 10px;

  border: 1px solid var(--line);
  border-radius: 17px;

  background:
    linear-gradient(
      150deg,
      rgba(255, 255, 255, .045),
      rgba(255, 255, 255, .018)
    );

  transition:
    background-color .18s ease,
    border-color .18s ease,
    box-shadow .18s ease;
}

.playlist-card:hover {
  border-color: var(--line-strong);
  background: rgba(255, 255, 255, .055);
}

.playlist-open {
  width: 100%;
  padding: 0;

  display: block;
  text-align: left;

  background: transparent;
}

.playlist-cover {
  width: 100%;
  aspect-ratio: 1 / 1;

  object-fit: cover;
  border-radius: 12px;

  background: var(--surface-3);
}

.cover-placeholder {
  display: grid;
  place-items: center;

  background:
    radial-gradient(
      circle at 25% 25%,
      rgba(234, 182, 216, .25),
      transparent 55%
    ),
    linear-gradient(145deg, #3b2b45, #211a2c);

  color: var(--accent);
}

.cover-placeholder svg {
  width: 34px;
  height: 34px;
}

.playlist-title {
  display: block;
  margin-top: 10px;

  overflow: hidden;
  color: var(--text);

  font-size: 13px;
  font-weight: 850;
  line-height: 1.35;

  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.playlist-owner {
  display: block;
  margin-top: 5px;

  overflow: hidden;
  color: var(--muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.playlist-stats {
  margin-top: 8px;

  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 7px;

  color: var(--muted);
  font-size: 10px;
}

.playlist-card-actions {
  margin-top: 8px;

  display: flex;
  justify-content: flex-end;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.track-row {
  min-width: 0;

  padding: 9px;

  display: flex;
  align-items: center;
  gap: 10px;

  border: 1px solid transparent;
  border-radius: 15px;

  background: rgba(255, 255, 255, .028);

  transition:
    background-color .15s ease,
    border-color .15s ease;
}

.track-row:hover {
  background: rgba(255, 255, 255, .055);
  border-color: rgba(255, 255, 255, .055);
}

.track-cover {
  width: 49px;
  height: 49px;

  flex: 0 0 49px;
  object-fit: cover;

  border-radius: 10px;
  background: var(--surface-3);
}

.track-copy {
  min-width: 0;
  flex: 1;
}

.track-title {
  overflow: hidden;

  color: var(--text);
  font-size: 12px;
  font-weight: 820;
  line-height: 1.4;

  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-sub {
  overflow: hidden;
  margin-top: 4px;

  color: var(--muted);
  font-size: 10px;

  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-actions {
  flex: 0 0 auto;

  display: flex;
  align-items: center;
  gap: 3px;
}

.track-action {
  width: 32px;
  height: 34px;
  padding: 0;

  display: inline-grid;
  place-items: center;

  border-radius: 10px;
  background: transparent;
  color: var(--muted);
}

.track-action:hover {
  background: rgba(255, 255, 255, .07);
  color: var(--accent);
}

.track-action svg {
  width: 17px;
  height: 17px;
}

.play-circle {
  width: 36px;
  height: 36px;
  padding: 0;

  display: inline-grid;
  place-items: center;

  border-radius: 50%;
  background: rgba(234, 182, 216, .13);
  color: var(--accent);
}

.play-circle:hover {
  background: rgba(234, 182, 216, .22);
}

.play-circle svg {
  width: 17px;
  height: 17px;
}

.track-management {
  display: flex;
  flex-direction: column;
}

.track-management button {
  width: 25px;
  height: 22px;
  padding: 0;

  display: grid;
  place-items: center;

  border-radius: 6px;
  background: transparent;
  color: var(--muted);
}

.track-management button:hover {
  color: var(--accent);
  background: rgba(255, 255, 255, .06);
}

.track-management svg {
  width: 13px;
  height: 13px;
}

.empty {
  min-height: 85px;
  padding: 22px 15px;

  display: flex;
  align-items: center;
  justify-content: center;

  border: 1px dashed rgba(233, 200, 231, .13);
  border-radius: 15px;

  color: var(--muted);
  text-align: center;
  font-size: 11px;
  line-height: 1.7;
}

.search-box {
  width: 100%;
  min-height: 49px;
  padding: 0 14px;

  display: flex;
  align-items: center;
  gap: 10px;

  border: 1px solid var(--line-strong);
  border-radius: 15px;

  background: rgba(255, 255, 255, .045);
}

.search-box svg {
  color: var(--muted);
}

.search-box input {
  width: 100%;
  min-width: 0;
  height: 47px;

  border: 0;
  outline: 0;

  background: transparent;
  color: var(--text);
  font-size: 13px;
}

.search-box input:focus {
  outline: 0;
}

.search-status {
  min-height: 23px;
  margin: 12px 2px;

  color: var(--muted);
  font-size: 11px;
}

.group-panel {
  padding: 16px;

  border: 1px solid var(--line-strong);
  border-radius: 17px;

  background:
    linear-gradient(
      135deg,
      rgba(234, 182, 216, .09),
      rgba(255, 255, 255, .025)
    );
}

.group-panel .track-title {
  font-size: 15px;
}

.group-ok {
  color: var(--success);
  font-weight: 850;
}

.group-error {
  color: var(--danger);
}

.detail-actions {
  margin: 15px 0;

  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.detail-head {
  margin: 17px 0;

  display: flex;
  align-items: flex-end;
  gap: 15px;
}

.detail-cover {
  width: 118px;
  height: 118px;

  flex: 0 0 118px;
  object-fit: cover;

  border-radius: 17px;
  background: var(--surface-3);

  box-shadow: 0 12px 30px rgba(0, 0, 0, .2);
}

.detail-name {
  margin-top: 5px;

  color: var(--text);
  font-size: clamp(20px, 5vw, 27px);
  font-weight: 900;
  line-height: 1.15;
  letter-spacing: -.7px;
}

.person-row {
  min-width: 0;

  padding: 10px;

  display: flex;
  align-items: center;
  gap: 10px;

  border: 1px solid var(--line);
  border-radius: 14px;

  background: rgba(255, 255, 255, .025);
}

.person-avatar {
  width: 43px;
  height: 43px;

  flex: 0 0 43px;
  object-fit: cover;

  border-radius: 50%;
  background: var(--surface-3);
}

.profile-head {
  padding: 20px 13px;

  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.profile-big-avatar {
  width: 96px;
  height: 96px;

  margin: 0 auto 14px;

  object-fit: cover;
  border-radius: 50%;

  background: var(--surface-3);
  border: 3px solid rgba(234, 182, 216, .28);
}

.profile-placeholder {
  display: grid;
  place-items: center;
  color: var(--accent);
}

.profile-head h1 {
  margin: 0;
  font-size: 25px;
  font-weight: 900;
}

.profile-bio {
  max-width: 460px;
  margin: 11px auto 0;

  color: var(--muted);
  font-size: 12px;
  line-height: 1.65;
}

.stat-row {
  width: min(100%, 350px);
  margin: 18px auto;

  display: flex;
  justify-content: center;
  gap: 30px;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.stat strong {
  font-size: 18px;
  font-weight: 900;
}

.stat span {
  color: var(--muted);
  font-size: 10px;
}

.notification {
  padding: 13px;

  display: flex;
  align-items: flex-start;
  gap: 11px;

  border: 1px solid var(--line);
  border-radius: 15px;

  background: rgba(255, 255, 255, .025);
}

.notification.unread {
  border-color: rgba(234, 182, 216, .24);
  background: rgba(234, 182, 216, .06);
}

.notification-icon {
  width: 37px;
  height: 37px;

  flex: 0 0 37px;

  display: grid;
  place-items: center;

  border-radius: 12px;
  background: rgba(234, 182, 216, .12);
  color: var(--accent);
}

.notification p {
  color: var(--text);
  font-size: 11px;
  line-height: 1.6;
}

.notification-actions {
  margin-top: 9px;

  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.field {
  margin: 13px 0;

  display: flex;
  flex-direction: column;
  gap: 7px;
}

.field label {
  color: var(--muted);
  font-size: 10px;
  font-weight: 850;
  letter-spacing: .9px;
}

.field input,
.field textarea,
.field select {
  width: 100%;
  min-height: 44px;
  padding: 11px 12px;

  border: 1px solid var(--line-strong);
  border-radius: 12px;

  background: rgba(255, 255, 255, .045);
  color: var(--text);

  font-size: 12px;
}

.field textarea {
  min-height: 86px;
  resize: vertical;
}

.field select {
  color-scheme: dark;
}

.upload-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.upload-row input[type="file"] {
  min-width: 0;
  flex: 1;
  color: var(--muted);
  font-size: 10px;
}

.upload-preview {
  width: 82px;
  height: 82px;

  object-fit: cover;

  border: 1px solid var(--line-strong);
  border-radius: 13px;
}

.upload-preview.avatar-preview {
  border-radius: 50%;
}

.upload-help {
  color: var(--muted);
  font-size: 10px;
  line-height: 1.55;
}

.upload-status {
  min-height: 18px;
  color: var(--accent);
  font-size: 10px;
}

progress {
  width: 100%;
  height: 7px;
  accent-color: var(--accent);
}

.bottom-nav {
  position: fixed;
  z-index: 30;

  left: 0;
  right: 0;
  bottom: 0;

  min-height: var(--nav-height);
  padding:
    8px 8px
    calc(8px + var(--safe-bottom));

  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: 4px;

  background: rgba(23, 18, 29, .96);
  border-top: 1px solid var(--line);

  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.nav-button {
  min-width: 54px;
  min-height: 48px;
  padding: 4px 8px;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;

  border-radius: 12px;
  background: transparent;
  color: var(--muted);

  font-size: 9px;
  font-weight: 750;
}

.nav-button svg {
  width: 21px;
  height: 21px;
}

.nav-button.active {
  background: rgba(234, 182, 216, .09);
  color: var(--accent);
}

.mini-player {
  position: fixed;
  z-index: 29;

  left: 10px;
  right: 10px;
  bottom: calc(var(--nav-height) + var(--safe-bottom) + 8px);

  width: min(calc(100% - 20px), 790px);
  min-height: var(--mini-height);

  margin: auto;
  padding: 8px 10px;

  display: none;
  align-items: center;
  gap: 9px;

  border: 1px solid rgba(234, 182, 216, .24);
  border-radius: 16px;

  background: rgba(39, 29, 47, .97);
  box-shadow: 0 10px 34px rgba(0, 0, 0, .32);

  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.mini-player.visible {
  display: flex;
  animation: mini-appear .16s ease both;
}

@keyframes mini-appear {
  from {
    opacity: 0;
    transform: scale(.985);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

.mini-player-main {
  min-width: 0;
  flex: 1;
  padding: 0;

  display: flex;
  align-items: center;
  gap: 10px;

  background: transparent;
  text-align: left;
}

.mini-cover {
  width: 44px;
  height: 44px;

  flex: 0 0 44px;
  object-fit: cover;

  border-radius: 9px;
  background: var(--surface-3);
}

.mini-track-info {
  min-width: 0;
  flex: 1;

  display: flex;
  flex-direction: column;
}

.mini-track-info strong {
  overflow: hidden;

  color: var(--text);
  font-size: 11px;
  font-weight: 850;

  text-overflow: ellipsis;
  white-space: nowrap;
}

.mini-track-info small {
  overflow: hidden;
  margin-top: 3px;

  color: var(--muted);
  font-size: 10px;

  text-overflow: ellipsis;
  white-space: nowrap;
}

.mini-progress {
  height: 3px;
  margin-top: 7px;

  overflow: hidden;
  border-radius: 9px;
  background: rgba(255, 255, 255, .16);
}

.mini-progress span {
  display: block;
  width: 0;
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
}

.mini-controls {
  display: flex;
  align-items: center;
  gap: 2px;
}

.mini-controls button {
  width: 37px;
  height: 40px;
  padding: 0;

  display: grid;
  place-items: center;

  border-radius: 50%;
  background: transparent;
  color: var(--text);
}

.mini-controls button:hover {
  color: var(--accent);
  background: rgba(255, 255, 255, .06);
}

.overlay {
  position: fixed;
  z-index: 50;
  inset: 0;

  display: none;
  align-items: flex-end;
  justify-content: center;

  padding-top: 25px;

  background: rgba(3, 2, 6, .68);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
}

.overlay.open {
  display: flex;
  animation: overlay-fade .16s ease both;
}

@keyframes overlay-fade {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

.sheet {
  width: min(100%, 820px);
  max-height: min(90dvh, 850px);

  overflow: auto;
  overscroll-behavior: contain;

  padding:
    13px 18px
    calc(22px + var(--safe-bottom));

  border: 1px solid var(--line-strong);
  border-bottom: 0;
  border-radius: 24px 24px 0 0;

  background: #211a2a;
  box-shadow: 0 -12px 55px rgba(0, 0, 0, .35);

  animation: sheet-appear .19s ease both;
  transform-origin: bottom center;
}

@keyframes sheet-appear {
  from {
    opacity: 0;
    transform: scale(.985);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

.sheet-handle {
  width: 39px;
  height: 4px;

  margin: 0 auto 15px;

  border-radius: 10px;
  background: #79687e;
}

.sheet-header {
  margin-bottom: 14px;

  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.sheet-header h2 {
  margin-top: 3px;
  font-size: 20px;
}

.sheet-body {
  min-width: 0;
}

.sheet-actions {
  margin-top: 18px;

  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.queue-sheet {
  max-height: 82dvh;
}

.queue-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.queue-current {
  border-color: rgba(234, 182, 216, .24);
  background: rgba(234, 182, 216, .07);
}

.player-full {
  position: fixed;
  z-index: 45;
  inset: 0;

  display: none;
  flex-direction: column;

  overflow-y: auto;
  overscroll-behavior: contain;

  padding:
    calc(16px + var(--safe-top))
    22px
    calc(20px + var(--safe-bottom));

  background:
    radial-gradient(
      ellipse at 50% 34%,
      rgba(187, 126, 179, .22),
      transparent 53%
    ),
    #100d17;
}

.player-full.open {
  display: flex;
  animation: player-appear .2s ease both;
}

@keyframes player-appear {
  from {
    opacity: 0;
    transform: scale(.99);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

.player-topbar {
  width: min(100%, 520px);
  margin: 0 auto;

  display: flex;
  align-items: center;
  justify-content: space-between;
}

.player-source-label {
  color: var(--muted);
  font-size: 10px;
  font-weight: 850;
  letter-spacing: 1.5px;
}

.player-art-wrap {
  position: relative;

  width: min(78vw, 370px);
  aspect-ratio: 1 / 1;

  margin: auto auto 22px;

  display: grid;
  place-items: center;
}

.player-art-glow {
  position: absolute;
  inset: 8%;

  border-radius: 50%;
  background: rgba(205, 132, 188, .28);
  filter: blur(38px);
}

.player-art {
  position: relative;
  z-index: 1;

  width: 100%;
  height: 100%;

  object-fit: cover;

  border: 1px solid rgba(255, 255, 255, .14);
  border-radius: 23px;

  background: var(--surface-3);

  box-shadow:
    0 18px 65px rgba(0, 0, 0, .36);
}

.player-track-details {
  width: min(100%, 520px);
  margin: 0 auto 22px;

  display: flex;
  align-items: center;
  gap: 12px;
}

.player-track-copy {
  min-width: 0;
  flex: 1;

  display: flex;
  flex-direction: column;
}

.player-track-copy strong {
  overflow: hidden;

  font-size: 19px;
  font-weight: 900;
  letter-spacing: -.4px;

  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-track-copy span {
  overflow: hidden;
  margin-top: 5px;

  color: var(--muted);
  font-size: 12px;

  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-progress {
  width: min(100%, 520px);
  margin: 0 auto;
}

.player-progress input {
  width: 100%;
  height: 5px;
  margin: 0;

  accent-color: var(--accent);
  cursor: pointer;
}

.time-row {
  margin-top: 7px;

  display: flex;
  justify-content: space-between;

  color: var(--muted);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.player-transport {
  width: min(100%, 520px);
  margin: 23px auto 20px;

  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 7px;
}

.player-transport button {
  width: 42px;
  height: 42px;
  padding: 0;

  display: grid;
  place-items: center;

  border-radius: 50%;
  background: transparent;
  color: var(--muted);
}

.player-transport button.active {
  color: var(--accent);
  background: rgba(234, 182, 216, .09);
}

.player-transport .main-play-button {
  width: 59px;
  height: 59px;

  background: linear-gradient(135deg, #f0c8e3, #d69bc8);
  color: #28192a;
}

.main-play-button svg {
  width: 25px;
  height: 25px;
}

.player-bottom {
  width: min(100%, 520px);
  margin: auto auto 0;

  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  color: var(--muted);
  font-size: 10px;
}

.toast {
  position: fixed;
  z-index: 80;

  left: 17px;
  right: 17px;
  bottom: calc(145px + var(--safe-bottom));

  width: min(calc(100% - 34px), 500px);
  margin: auto;
  padding: 12px 15px;

  border: 1px solid rgba(234, 182, 216, .2);
  border-radius: 13px;

  background: #f1e5ef;
  color: #211726;

  box-shadow: 0 9px 35px rgba(0, 0, 0, .3);

  font-size: 11px;
  font-weight: 850;
  text-align: center;

  display: none;
}

.toast.show {
  display: block;
  animation: toast-appear .15s ease both;
}

@keyframes toast-appear {
  from {
    opacity: 0;
    transform: scale(.985);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

.skeleton {
  min-height: 80px;
  border-radius: 15px;

  background:
    linear-gradient(
      100deg,
      rgba(255, 255, 255, .035) 25%,
      rgba(255, 255, 255, .075) 40%,
      rgba(255, 255, 255, .035) 55%
    );

  background-size: 220% 100%;
  animation: skeleton-shimmer 1.5s ease infinite;
}

@keyframes skeleton-shimmer {
  to {
    background-position-x: -220%;
  }
}

.search-result-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 11px;
}

.person-card {
  min-width: 0;
  padding: 13px;

  border: 1px solid var(--line);
  border-radius: 15px;

  background: rgba(255, 255, 255, .025);
}

.person-card .person-row {
  padding: 0;
  border: 0;
  background: transparent;
}

.group-status-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  margin-top: 8px;

  color: var(--muted);
  font-size: 10px;
}

.dragging {
  opacity: .45;
}

.drag-over {
  border-color: var(--accent);
  background: rgba(234, 182, 216, .08);
}

/* -------------------------------------------------------
   Multi-group player
   ------------------------------------------------------- */

.group-connect {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 10px;
  margin-top: 18px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  background: rgba(31, 25, 39, 0.78);
}

.group-connect .field {
  min-width: 0;
  margin: 0;
}

.group-list-heading {
  margin-top: 24px;
}

.group-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  margin-top: 14px;
}

.group-card {
  min-width: 0;
  padding: 14px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  background: rgba(31, 25, 39, 0.94);
}

.group-card.selected {
  border-color: rgba(177, 135, 255, 0.65);
}

.group-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.group-card-title {
  min-width: 0;
  flex: 1;
}

.group-status-pill {
  flex: 0 0 auto;
  padding: 5px 9px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
}

.group-status-pill.is-playing {
  color: #a8e6bd;
  background: rgba(69, 180, 110, 0.12);
}

.group-status-pill.is-paused {
  color: #f0d18a;
  background: rgba(210, 160, 65, 0.12);
}

.group-status-pill.is-idle {
  color: rgba(255, 255, 255, 0.62);
  background: rgba(255, 255, 255, 0.05);
}

.group-card-current {
  margin-top: 16px;
}

.group-current {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
  margin-top: 9px;
}

.group-current .track-cover {
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  object-fit: cover;
  border-radius: 9px;
}

.group-card-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 13px;
}

.group-card-actions > button {
  min-width: 0;
}

.group-card-actions button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.group-view-only {
  margin-top: 13px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 11px;
  color: rgba(255, 255, 255, 0.62);
  background: rgba(255, 255, 255, 0.035);
  font-size: 12px;
  line-height: 1.5;
}

.group-card-queue {
  margin-top: 17px;
  padding-top: 13px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.group-card-queue-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 9px;
}

.group-queue-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px 0;
}

.group-queue-row + .group-queue-row {
  border-top: 1px solid rgba(255, 255, 255, 0.045);
}

.group-queue-row .track-copy {
  flex: 1;
  min-width: 0;
}

.group-empty {
  padding: 12px 0;
  text-align: left;
}

.group-load-more {
  display: block;
  width: 100%;
  margin-top: 14px;
}

.group-target-note {
  margin-top: 16px;
  padding: 11px 12px;
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.045);
  color: rgba(255, 255, 255, 0.68);
  font-size: 13px;
}

.group-target-note strong {
  color: rgba(255, 255, 255, 0.94);
}

@media (min-width: 640px) {
  .app-shell {
    padding-right: 24px;
    padding-left: 24px;
  }

  .topbar {
    margin-right: -24px;
    margin-left: -24px;
    padding-right: 25px;
    padding-left: 25px;
  }

  .grid,
  .search-result-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }

  .page {
    padding-top: 27px;
  }

  .hero-card {
    padding: 31px;
  }

  .detail-cover {
    width: 145px;
    height: 145px;
    flex-basis: 145px;
  }

  .track-cover {
    width: 53px;
    height: 53px;
    flex-basis: 53px;
  }
}

@media (max-width: 480px) {
  .group-connect {
    grid-template-columns: minmax(0, 1fr);
  }

  .group-card {
    padding: 12px;
  }

  .group-card-actions {
    gap: 7px;
  }
}

@media (max-width: 380px) {
  .app-shell {
    padding-right: 12px;
    padding-left: 12px;
  }

  .topbar {
    margin-right: -12px;
    margin-left: -12px;
    padding-right: 13px;
    padding-left: 13px;
  }

  .track-row {
    gap: 7px;
    padding: 7px;
  }

  .track-cover {
    width: 43px;
    height: 43px;
    flex-basis: 43px;
  }

  .track-action {
    width: 28px;
  }

  .play-circle {
    width: 33px;
    height: 33px;
  }

  .track-title {
    font-size: 11px;
  }

  .track-sub {
    font-size: 9px;
  }

  .hero-card {
    padding: 20px 17px;
  }

  .detail-cover {
    width: 94px;
    height: 94px;
    flex-basis: 94px;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}




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
