
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
