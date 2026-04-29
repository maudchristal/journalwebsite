import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const NAV_KEY = "written_active_page";
const JOURNAL_SECTION_KEY = "written_journal_section";
const SETTINGS_KEY = "written_settings";
const GLOBAL_BIO_KEY = "written_global_bios";
const PROFILE_DOC_ID = "main";
const USERNAME_RE = /^[a-z0-9._]{3,24}$/;
const REPLICATE_PROXY_URL = "https://itp-ima-replicate-proxy.web.app/api/create_n_get";
const AI_REFLECTION_MODEL = "meta/meta-llama-3-8b-instruct";
const authToken = "";

/** Normalize Replicate proxy JSON response (optional AI reflection click handler). */
const normalizeReplicateOutput = (prediction) => {
  if (prediction == null) return "";
  if (typeof prediction === "string") return prediction;
  const err = prediction.error ?? prediction.detail;
  if (err) throw new Error(typeof err === "string" ? err : JSON.stringify(err));
  const out = prediction.output;
  if (out == null) return typeof prediction === "object" ? JSON.stringify(prediction, null, 2) : String(prediction);
  if (typeof out === "string") return out;
  if (Array.isArray(out)) return out.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("");
  if (typeof out === "object" && out !== null && typeof out.text === "string") return out.text;
  return String(out);
};

const $ = (id) => document.getElementById(id);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const on = (el, evt, cb) => {
  if (el) el.addEventListener(evt, cb);
};

const state = {
  auth: null,
  db: null,
  user: null,
  unsub: null,
  entries: [],
  onboardingStep: 0,
  onboardingCompleted: false,
  activePage: localStorage.getItem(NAV_KEY) || "home",
  journalSection: localStorage.getItem(JOURNAL_SECTION_KEY) || "All",
  timelineMode: "my",
  settings: {
    displayName: "",
    username: "",
    bio: "",
    defaultAudience: "Self",
    defaultEchoesOptIn: false,
  },
  globalFilter: "All",
  activeBioId: null,
  globalBios: [],
};

const onboardingSlides = [
  {
    icon: "🕊️",
    title: "A journal for real life, not perfect life.",
    copy: "Write freely in a private space that meets you where you are.",
  },
  {
    icon: "🧭",
    title: "One home for your story.",
    copy: "Journal, letters, circle, timeline, and echoes all connect to the same living story.",
  },
  {
    icon: "🔐",
    title: "Privacy first, always your choice.",
    copy: "Everything starts private by default, and you choose what to share and when.",
  },
];

const ids = {
  form: $("entry-form"), entriesList: $("entries-list"), timelineList: $("timeline-list"),
  previewBanner: $("preview-banner"), authSetupHint: $("auth-setup-hint"), authBar: $("auth-bar"),
  authGuestPanel: $("auth-guest-panel"), authSignedInPanel: $("auth-signed-in"), authUserLabel: $("auth-user-label"),
  sidebarUserName: $("sidebar-user-name"),
  signOutBtn: $("sign-out-btn"), googleSignInBtn: $("google-sign-in-btn"), bannerSignInBtn: $("banner-sign-in-btn"),
  authModal: $("auth-modal"), authModalClose: $("auth-modal-close"), authContextTitle: $("auth-context-title"),
  authContextCopy: $("auth-context-copy"), onboardingPanel: $("onboarding-panel"), authLoginPanel: $("auth-login-panel"),
  onboardingTitle: $("auth-modal-title"), onboardingCopy: $("onboarding-copy"), onboardingIllustration: $("onboarding-illustration"),
  onboardingNextBtn: $("onboarding-next-btn"), onboardingBackBtn: $("onboarding-back-btn"),
  backToOnboardingBtn: $("back-to-onboarding-btn"), onboardingDots: $$(".onboarding-dot"), sidebarNav: $("sidebar-nav"),
  navItems: $$(".nav-item"), mobileTabs: $$(".mobile-tab"), pages: $$(".page"), sectionTabs: $$(".section-tab"),
  circleTabs: $$('[data-circle-tab]'), letterTabs: $$('[data-letter-tab]'), newEntryBtn: $("new-entry-btn"),
  quickWriteBtn: $("quick-write-btn"), writeLetterBtn: $("write-letter-btn"), entryDrawer: $("entry-drawer"),
  entryDrawerClose: $("entry-drawer-close"), scheduleToggleBtn: $("schedule-toggle-btn"), scheduleToggle: $("schedule-toggle"),
  scheduleOptions: $("schedule-options"), releaseTarget: $("release-target"), individualOptions: $("individual-options"),
  sectionChips: $("section-chips"), visibilityGroup: $("visibility-group"), timelineSectionFilter: $("timeline-section-filter"),
  timelinePersonFilter: $("timeline-person-filter"), timelineYearFilter: $("timeline-year-filter"), timelineMonthFilter: $("timeline-month-filter"),
  timelineDayFilter: $("timeline-day-filter"), timelineTimeFilter: $("timeline-time-filter"), timelineToggleBtn: $("timeline-toggle-btn"),
  timelineClearBtn: $("timeline-clear-btn"), timelineResults: $("timeline-results"),
  lettersOutboxList: $("letters-outbox-list"),
  letterPrompts: $("letter-prompts"),
  globalSearch: $("global-search"), globalFilters: $("global-filters"), globalCards: $("global-cards"),
  activeBiography: $("active-biography"), bioSubjectName: $("bio-subject-name"), bioTagline: $("bio-tagline"),
  bioMeta: $("bio-meta"), bioContributions: $("bio-contributions"), addBioEntryBtn: $("add-bio-entry-btn"),
  closeBioBtn: $("close-bio-btn"), startBiographyBtn: $("start-biography-btn"), globalModal: $("global-modal"),
  globalModalClose: $("global-modal-close"), createBioBtn: $("create-bio-btn"), bioSubjectInput: $("bio-subject-input"),
  bioTaglineInput: $("bio-tagline-input"), bioCategoryInput: $("bio-category-input"), bioCoverInput: $("bio-cover-input"),
  echoesFeed: $("echoes-feed"), greetingTitle: $("greeting-title"), continueCard: $("continue-card"), arrivingSoon: $("arriving-soon"),
  dailyPrompt: $("daily-prompt"), dailyPromptInput: $("daily-prompt-input"),
  entryBodyEditor: $("entry-body-editor"), entryWordCount: $("entry-word-count"), editorToolbar: document.querySelector(".editor-toolbar"),
  startFirstEntryBtn: $("start-first-entry-btn"),
  continueGuestBtn: $("continue-guest-btn"),
  settingsDisplayName: $("settings-display-name"), settingsUsername: $("settings-username"), settingsBio: $("settings-bio"),
  settingsVisibilityGroup: $("settings-visibility-group"), settingsEchoesOptIn: $("settings-default-echoes-opt-in"),
  settingsStatus: $("settings-status"),
  saveSettingsBtn: $("save-settings-btn"),
  authActionButtons: $$('[data-action-label]'),
};

/** Main entry form node — must match ids.form (was breaking entire script when named `form` was missing). */
const form = ids.form;

const {
  googleSignInBtn,
  signOutBtn,
  releaseTarget,
  scheduleToggleBtn,
  sectionChips,
  visibilityGroup,
  timelineSectionFilter,
  timelinePersonFilter,
  timelineYearFilter,
  timelineMonthFilter,
  timelineDayFilter,
  timelineTimeFilter,
  timelineToggleBtn,
  newEntryBtn,
  quickWriteBtn,
  writeLetterBtn,
  entryDrawerClose,
  entryDrawer,
  bannerSignInBtn,
  authModalClose,
  onboardingNextBtn,
  onboardingBackBtn,
  backToOnboardingBtn,
  authModal,
  sidebarNav,
} = ids;

const isFirebaseConfigured = () => Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && !String(firebaseConfig.apiKey).includes("YOUR_"));
const normalizeDate = (e) => (e.createdAt && typeof e.createdAt.toDate === "function" ? e.createdAt.toDate().toISOString() : String(e.createdAt || new Date().toISOString()));
const fmt = (iso) => new Date(iso).toLocaleString();
const fmtShort = (iso) => new Date(iso).toLocaleDateString();
const fmtRelative = (iso) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return fmtShort(iso);
};
const isReleased = (e) => !e.isScheduled || Date.now() >= new Date(e.releaseDate).getTime();
const getStatus = (e) => (e.isDraft ? "draft" : !e.isScheduled ? "published" : isReleased(e) ? "delivered" : "time-locked");
const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
const parseSettings = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    state.settings = {
      ...state.settings,
      ...parsed,
      username: String(parsed?.username || "").toLowerCase(),
      defaultAudience: ["Self", "Family", "Public"].includes(parsed?.defaultAudience) ? parsed.defaultAudience : "Self",
      defaultEchoesOptIn: Boolean(parsed?.defaultEchoesOptIn),
    };
  } catch (err) {
    console.error("Could not parse settings:", err);
  }
};
const parseGlobalBios = () => {
  try {
    const raw = localStorage.getItem(GLOBAL_BIO_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    state.globalBios = Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Could not parse global biographies:", err);
  }
};
const seedGlobalBios = () => {
  if (state.globalBios.length) return;
  const now = new Date().toISOString();
  state.globalBios = [
    {
      id: "bio_maya_angelou",
      subject: "Maya Angelou",
      tagline: "Poet. Memoirist. Voice of resilience.",
      category: "People",
      coverImage: "",
      createdAt: now,
      updatedAt: now,
      contributions: [
        { id: "c_seed_1", writer: "Anonymous", createdAt: now, body: "Her words continue to shape how many of us think about courage and dignity." },
      ],
    },
    {
      id: "bio_harlem",
      subject: "Harlem Renaissance",
      tagline: "A cultural movement that transformed art and identity.",
      category: "Movements",
      coverImage: "",
      createdAt: now,
      updatedAt: now,
      contributions: [{ id: "c_seed_2", writer: "Anonymous", createdAt: now, body: "A living archive of writers, musicians, and thinkers." }],
    },
  ];
  persistGlobalBios();
};
const DAILY_PROMPTS = [
  "What did today teach you that yesterday could not?",
  "Which version of you showed up today, and why?",
  "What are you quietly carrying that deserves words?",
  "Name one moment you want to remember in ten years.",
];
const persistSettings = () => localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
const persistGlobalBios = () => localStorage.setItem(GLOBAL_BIO_KEY, JSON.stringify(state.globalBios));
const normalizeUsername = (v) => String(v || "").trim().toLowerCase();
const setSettingsStatus = (message = "", type = "") => {
  if (!ids.settingsStatus) return;
  ids.settingsStatus.textContent = message;
  ids.settingsStatus.classList.remove("success", "error");
  if (type) ids.settingsStatus.classList.add(type);
};
let settingsStatusTimer = null;
const setSaveButtonBusy = (busy) => {
  if (!ids.saveSettingsBtn) return;
  ids.saveSettingsBtn.disabled = busy;
  ids.saveSettingsBtn.textContent = busy ? "Saving..." : "Save";
};
const applySettingsToUi = () => {
  if (ids.settingsDisplayName) ids.settingsDisplayName.value = state.settings.displayName || "";
  if (ids.settingsUsername) ids.settingsUsername.value = state.settings.username || "";
  if (ids.settingsBio) ids.settingsBio.value = state.settings.bio || "";
  if (ids.settingsEchoesOptIn) ids.settingsEchoesOptIn.checked = Boolean(state.settings.defaultEchoesOptIn);
  if (ids.settingsVisibilityGroup) {
    ids.settingsVisibilityGroup.querySelectorAll(".visibility-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.defaultAudience === state.settings.defaultAudience);
    });
  }
  if ($("entry-audience")) $("entry-audience").value = state.settings.defaultAudience;
  if ($("echoes-opt-in")) $("echoes-opt-in").checked = Boolean(state.settings.defaultEchoesOptIn);
  if (ids.visibilityGroup) {
    ids.visibilityGroup.querySelectorAll(".visibility-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.audience === state.settings.defaultAudience);
    });
  }
};
const claimUsername = async ({ uid, username, displayName, bio }) => {
  const clean = normalizeUsername(username);
  if (!USERNAME_RE.test(clean)) throw new Error("Username must be 3-24 chars: lowercase letters, numbers, '.' or '_'.");
  const profileRef = doc(state.db, "users", uid, "profile", PROFILE_DOC_ID);
  const usernameRef = doc(state.db, "usernames", clean);
  await runTransaction(state.db, async (tx) => {
    const [nameSnap, profileSnap] = await Promise.all([tx.get(usernameRef), tx.get(profileRef)]);
    const existingOwner = nameSnap.exists() ? nameSnap.data().uid : null;
    const existingProfile = profileSnap.exists() ? profileSnap.data() : null;
    if (existingOwner && existingOwner !== uid) throw new Error("That username is already taken.");
    if (existingProfile?.username && existingProfile.username !== clean) throw new Error("Username is locked after initial claim.");
    tx.set(usernameRef, { uid, claimedAt: serverTimestamp() }, { merge: true });
    tx.set(
      profileRef,
      {
        uid,
        username: clean,
        displayName: String(displayName || "").trim(),
        bio: String(bio || "").trim(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
  return clean;
};
const loadUserProfile = async (uid) => {
  if (!state.db) return;
  const profileRef = doc(state.db, "users", uid, "profile", PROFILE_DOC_ID);
  const snap = await getDoc(profileRef);
  if (!snap.exists()) return;
  const data = snap.data();
  state.settings.displayName = String(data.displayName || state.settings.displayName || "");
  state.settings.username = normalizeUsername(data.username || state.settings.username || "");
  state.settings.bio = String(data.bio || state.settings.bio || "");
  persistSettings();
  applySettingsToUi();
};

const setActivePage = (page) => {
  state.activePage = page;
  localStorage.setItem(NAV_KEY, page);
  ids.pages.forEach((el) => el.classList.toggle("active", el.dataset.page === page));
  ids.navItems.forEach((el) => el.classList.toggle("active", el.dataset.page === page));
  ids.mobileTabs.forEach((el) => el.classList.toggle("active", el.dataset.page === page));
  document.title = "Written - Your Personal Journal";
};

const setAuthUi = () => {
  const firebaseReady = isFirebaseConfigured();
  if (!firebaseReady) {
    ids.authSetupHint.classList.add("hidden");
    ids.previewBanner.classList.remove("hidden");
  } else {
    ids.authSetupHint.classList.add("hidden");
  }
  const signedIn = firebaseReady && Boolean(state.user);
  ids.authGuestPanel.classList.toggle("hidden", signedIn);
  ids.authSignedInPanel.classList.toggle("hidden", !signedIn);
  ids.previewBanner.classList.toggle("hidden", signedIn && firebaseReady);
  if (signedIn) {
    const who = state.user.displayName?.trim() || state.user.email || state.user.uid;
    ids.authUserLabel.textContent = `Signed in as ${who}`;
    ids.sidebarUserName.textContent = who;
  } else {
    ids.authUserLabel.textContent = "";
    ids.sidebarUserName.textContent = state.settings.displayName?.trim() || "Guest Writer";
  }
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const name =
    state.user?.displayName?.trim() ||
    (state.user?.email ? state.user.email.split("@")[0] : state.settings.displayName?.trim() || "Writer");
  ids.greetingTitle.innerHTML = `Good ${part}, <span class="accent-name">${esc(name)}</span>.`;
};

const showAuthModal = (action = "save your story") => {
  if (state.user) return false;
  ids.authContextTitle.textContent = `Sign in to ${action}`;
  ids.authContextCopy.textContent = `You can explore everything first. Sign in when you are ready to ${action}.`;
  if (!state.onboardingCompleted) {
    ids.onboardingPanel.classList.remove("hidden");
    ids.authLoginPanel.classList.add("hidden");
    ids.authBar.classList.add("hidden");
    state.onboardingStep = 0;
    updateOnboarding();
  } else {
    ids.onboardingPanel.classList.add("hidden");
    ids.authLoginPanel.classList.remove("hidden");
    ids.authBar.classList.remove("hidden");
  }
  ids.authModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  return true;
};

const hideAuthModal = () => {
  ids.authModal.classList.add("hidden");
  if (ids.entryDrawer.classList.contains("hidden")) document.body.style.overflow = "";
};

const updateOnboarding = () => {
  const slide = onboardingSlides[state.onboardingStep];
  if (ids.onboardingTitle) ids.onboardingTitle.textContent = slide.title;
  ids.onboardingCopy.textContent = slide.copy;
  if (ids.onboardingIllustration) ids.onboardingIllustration.textContent = slide.icon;
  ids.onboardingDots.forEach((dot, i) => dot.classList.toggle("active", i === state.onboardingStep));
  ids.onboardingBackBtn.classList.toggle("hidden", state.onboardingStep === 0);
  ids.onboardingNextBtn.textContent = state.onboardingStep === onboardingSlides.length - 1 ? "Continue to sign in" : "Next";
};

const openDrawer = (asLetter = false) => {
  $("drawer-title").textContent = asLetter ? "Write a Letter" : "New Entry";
  if (!state.user) return showAuthModal(asLetter ? "send this letter" : "save your entry");
  if (asLetter) {
    $("entry-category").value = "Letters";
    ids.sectionChips.querySelectorAll(".chip").forEach((el) => el.classList.toggle("active", el.dataset.category === "Letters"));
  }
  ids.entryDrawer.classList.remove("hidden");
  document.body.style.overflow = "hidden";
};
const closeDrawer = () => {
  ids.entryDrawer.classList.add("hidden");
  if (ids.authModal.classList.contains("hidden")) document.body.style.overflow = "";
};

const clearForm = () => {
  if (!form) return;
  form.reset();
  $("entry-category").value = "Love";
  $("entry-audience").value = state.settings.defaultAudience;
  ids.sectionChips.querySelectorAll(".chip").forEach((el) => el.classList.remove("active"));
  ids.visibilityGroup.querySelectorAll(".visibility-btn").forEach((el) => el.classList.remove("active"));
  ids.sectionChips.querySelector('[data-category="Love"]')?.classList.add("active");
  ids.visibilityGroup.querySelector(`[data-audience="${state.settings.defaultAudience}"]`)?.classList.add("active");
  ids.scheduleToggle.checked = false;
  ids.scheduleOptions.classList.add("hidden");
  ids.scheduleToggleBtn.classList.remove("open");
  ids.individualOptions.classList.add("hidden");
  $("echoes-opt-in").checked = Boolean(state.settings.defaultEchoesOptIn);
  if (ids.entryBodyEditor) ids.entryBodyEditor.innerHTML = "";
  if ($("entry-body")) $("entry-body").value = "";
  if (ids.entryWordCount) ids.entryWordCount.textContent = "0 words";
};

const normalizeEditorText = () => String(ids.entryBodyEditor?.innerText || "").replace(/\u00A0/g, " ").trim();
const setEditorContent = (text = "") => {
  if (!ids.entryBodyEditor) return;
  ids.entryBodyEditor.innerText = text;
  $("entry-body").value = text.trim();
  updateEditorMetrics();
};
const addContributionToBio = (bioId, { body, writer }) => {
  const idx = state.globalBios.findIndex((b) => b.id === bioId);
  if (idx < 0) return false;
  const contribution = {
    id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    writer: writer || "Anonymous",
    body: String(body || "").trim(),
    createdAt: new Date().toISOString(),
  };
  state.globalBios[idx].contributions.push(contribution);
  state.globalBios[idx].updatedAt = contribution.createdAt;
  persistGlobalBios();
  return true;
};
const updateEditorMetrics = () => {
  if (!ids.entryBodyEditor) return;
  const words = normalizeEditorText()
    .split(/\s+/)
    .filter(Boolean).length;
  if (ids.entryWordCount) ids.entryWordCount.textContent = `${words} ${words === 1 ? "word" : "words"}`;
  ids.entryBodyEditor.style.height = "auto";
  ids.entryBodyEditor.style.height = `${Math.max(180, ids.entryBodyEditor.scrollHeight)}px`;
};

const renderEntries = () => {
  const entries = state.entries
    .map((e) => ({ ...e, createdAt: normalizeDate(e) }))
    .filter(isReleased)
    .filter((e) => state.journalSection === "All" || e.category === state.journalSection)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (entries.length === 0) {
    ids.entriesList.innerHTML = "<li class='entry-item muted'>Your first entry is waiting to be written.</li>";
    ids.continueCard.textContent = "Start your first entry and create a small ritual you can return to anytime.";
    ids.arrivingSoon.textContent = "When you schedule a letter, this space previews what is unlocking next.";
    ids.lettersOutboxList.innerHTML =
      "<li class='letters-empty'><h3>Time-release letters</h3><p class='muted'>Write something today and choose when it opens in the future - for your future self, a loved one, or your family timeline.</p><button type='button' id='letters-first-btn' class='secondary-action'>Write your first letter</button></li>";
    return;
  }

  const soon = entries.filter((e) => e.isScheduled && !isReleased(e)).sort((a, b) => new Date(a.releaseDate) - new Date(b.releaseDate))[0];
  ids.arrivingSoon.textContent = soon
    ? `A letter to ${soon.deliveryMethod || "yourself"} opens in ${Math.max(1, Math.ceil((new Date(soon.releaseDate).getTime() - Date.now()) / (24 * 3600 * 1000)))} day(s).`
    : "No time-released letters are arriving soon.";
  ids.continueCard.textContent = `Continue "${entries[0].title}" from ${fmtShort(entries[0].createdAt)}.`;

  ids.entriesList.innerHTML = entries
    .map((e) => {
      const sectionClass = String(e.category || "").toLowerCase().replace(/\s+/g, "-");
      return `<li class="entry-item"><div class="entry-head"><span class="section-dot ${esc(sectionClass)}"></span><span class="pill">${esc(e.category)}</span><span class="status-badge">${getStatus(e)}</span></div><h3>${esc(e.title)}</h3><p class="entry-preview"><em>${esc(e.body || "").slice(0, 170)}...</em></p><p class="muted">${fmtRelative(e.createdAt)} • <span class="pill">${esc(e.audience || "Self")}</span></p></li>`;
    })
    .join("");

  ids.lettersOutboxList.innerHTML = entries
    .filter((e) => e.category === "Letters" || e.isScheduled)
    .slice(0, 8)
    .map((e) => `<li class="entry-item"><strong>${esc(e.title)}</strong><div class="muted">${esc(e.deliveryMethod || "me")} • ${fmtShort(e.releaseDate || e.createdAt)} • ${getStatus(e)}</div></li>`)
    .join("");
};

const renderTimeline = () => {
  const section = ids.timelineSectionFilter.value;
  const person = String(ids.timelinePersonFilter?.value || "").trim().toLowerCase();
  const year = Number(ids.timelineYearFilter?.value || 0);
  const month = Number(ids.timelineMonthFilter?.value || 0);
  const day = Number(ids.timelineDayFilter?.value || 0);
  const time = String(ids.timelineTimeFilter?.value || "");
  const [filterHour, filterMinute] = time ? time.split(":").map(Number) : [];
  const entries = state.entries
    .map((e) => ({ ...e, createdAt: normalizeDate(e) }))
    .filter(isReleased)
    .filter((e) => section === "All" || e.category === section)
    .filter((e) => !person || String(e.authorName || "").toLowerCase().includes(person) || String(e.deliveryMethod || "").toLowerCase().includes(person))
    .filter((e) => {
      const dt = new Date(e.createdAt);
      if (Number.isNaN(dt.getTime())) return false;
      if (year && dt.getFullYear() !== year) return false;
      if (month && dt.getMonth() + 1 !== month) return false;
      if (day && dt.getDate() !== day) return false;
      if (time && (dt.getHours() !== filterHour || dt.getMinutes() !== filterMinute)) return false;
      return true;
    })
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  ids.timelineList.innerHTML =
    entries.length === 0
      ? "<li><div class='timeline-empty'><p class='muted'>Your story appears here over time. Each entry becomes a point in your personal timeline.</p><div class='timeline-skeleton-item'><div class='skeleton-line title'></div><div class='skeleton-line meta'></div></div><div class='timeline-skeleton-item'><div class='skeleton-line title'></div><div class='skeleton-line meta'></div></div><div class='timeline-skeleton-item'><div class='skeleton-line title'></div><div class='skeleton-line meta'></div></div></div></li>"
      : entries
          .map((e) => `<li class="timeline-item"><strong>${esc(e.title)}</strong><div>${esc(e.category)} • ${state.timelineMode === "family" ? esc(e.authorName || "Family") : "You"}</div><div class="muted">${fmt(e.createdAt)}</div></li>`)
          .join("");
  if (ids.timelineResults) {
    ids.timelineResults.textContent = entries.length
      ? `${entries.length} matching timeline entr${entries.length === 1 ? "y" : "ies"}`
      : "No entries match your current filters.";
  }
};

const renderEchoes = () => {
  const entries = state.entries.map((e) => ({ ...e, createdAt: normalizeDate(e) })).filter((e) => e.echoesOptIn && isReleased(e));
  ids.echoesFeed.innerHTML =
    entries.length === 0
      ? "<li class='muted'>No echoes yet. Turn on opt-in to see anonymous thematic matches.</li>"
      : entries
          .slice(0, 4)
          .map((e) => `<li class="entry-item"><strong>${esc(e.category)}</strong><p>${esc(e.body).slice(0, 110)}...</p><button class="tab" data-action-label="resonate with this echo">This resonated</button></li>`)
          .join("");
};

const getVisibleGlobalBios = () => {
  const term = String(ids.globalSearch?.value || "").trim().toLowerCase();
  return state.globalBios.filter((bio) => {
    const byFilter = state.globalFilter === "All" || bio.category === state.globalFilter;
    const byTerm =
      !term ||
      String(bio.subject || "").toLowerCase().includes(term) ||
      String(bio.tagline || "").toLowerCase().includes(term) ||
      String(bio.category || "").toLowerCase().includes(term);
    return byFilter && byTerm;
  });
};

const renderActiveBio = () => {
  const bio = state.globalBios.find((x) => x.id === state.activeBioId);
  if (!bio) {
    ids.activeBiography.classList.add("hidden");
    return;
  }
  ids.activeBiography.classList.remove("hidden");
  ids.bioSubjectName.textContent = bio.subject;
  ids.bioTagline.textContent = bio.tagline || "Living biography";
  ids.bioMeta.textContent = `${bio.contributions.length} writers • Last updated ${fmt(bio.updatedAt || bio.createdAt)}`;
  ids.bioContributions.innerHTML = bio.contributions
    .slice()
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map(
      (entry) =>
        `<li class="entry-item bio-contribution"><strong>${esc(entry.writer || "Anonymous")}</strong><div class="bio-meta">${fmt(entry.createdAt)}</div><p>${esc(entry.body || "")}</p><button type="button" class="report-btn" data-report-id="${esc(entry.id)}">Flag/report</button></li>`
    )
    .join("");
};

const renderGlobal = () => {
  const visible = getVisibleGlobalBios();
  ids.globalCards.innerHTML =
    visible.length === 0
      ? "<li class='entry-item muted'>No biographies match yet. Start one to open the first thread.</li>"
      : visible
          .map((bio) => {
            const initial = String(bio.subject || "?").trim().charAt(0).toUpperCase() || "?";
            return `<li class="global-card"><div class="global-head"><div class="global-avatar">${esc(initial)}</div><div><strong>${esc(
              bio.subject
            )}</strong><div class="muted">${esc(bio.tagline || "")}</div></div></div><div class="muted">${bio.contributions.length} contributors</div><div class="muted">Last updated ${fmt(
              bio.updatedAt || bio.createdAt
            )}</div><button type="button" class="secondary-action" data-open-bio="${esc(bio.id)}">Open Active Biography</button></li>`;
          })
          .join("");
  renderActiveBio();
};

const rerender = () => {
  renderEntries();
  renderTimeline();
  renderEchoes();
  renderGlobal();
};

if (isFirebaseConfigured()) {
  const app = initializeApp(firebaseConfig);
  state.auth = getAuth(app);
  state.db = getFirestore(app);
  onAuthStateChanged(state.auth, (user) => {
    state.user = user;
    if (typeof state.unsub === "function") state.unsub();
    state.entries = [];
    if (user) {
      if (!state.settings.displayName) {
        state.settings.displayName = user.displayName?.trim() || (user.email ? user.email.split("@")[0] : "");
      }
      loadUserProfile(user.uid).catch((err) => console.error("Profile load failed:", err));
      const q = query(collection(state.db, "users", user.uid, "entries"), orderBy("createdAt", "desc"));
      state.unsub = onSnapshot(q, (snap) => {
        state.entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rerender();
      });
    } else {
      rerender();
    }
    setAuthUi();
  });
} else {
  setAuthUi();
  rerender();
}

on(googleSignInBtn, "click", async () => {
  if (!state.auth) return;
  try {
    await signInWithPopup(state.auth, new GoogleAuthProvider());
    state.onboardingCompleted = true;
    hideAuthModal();
  } catch (e) {
    if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") return;
    alert(e.message || "Google sign-in failed.");
  }
});

on(signOutBtn, "click", async () => {
  if (!state.auth) return;
  try {
    await signOut(state.auth);
  } catch (e) {
    alert(e.message || "Sign out failed.");
  }
});

on(form, "submit", async (event) => {
  event.preventDefault();
  if (showAuthModal("save your entry")) return;
  $("entry-body").value = normalizeEditorText();
  const fd = new FormData(form);
  if (!String(fd.get("body") || "").trim()) return alert("Please write your journal entry.");
  const isScheduled = fd.get("isScheduled") === "on";
  const releaseDate = fd.get("releaseDate");
  if (isScheduled && !releaseDate) return alert("Please choose a release date/time.");
  if (fd.get("releaseTarget") === "person" && !fd.get("recipientName")) return alert("Please enter a recipient name.");
  const payload = {
    title: String(fd.get("title") || "").trim(),
    category: String(fd.get("category") || "Love"),
    body: String(fd.get("body") || "").trim(),
    audience: String(fd.get("audience") || "Self"),
    globalSubject: String(fd.get("globalSubject") || "").trim(),
    recipientName: String(fd.get("recipientName") || "").trim(),
    deliveryMethod: String(fd.get("releaseTarget") || "me"),
    isScheduled,
    releaseDate: isScheduled ? String(releaseDate) : "",
    aiOptIn: fd.get("aiOptIn") === "on",
    echoesOptIn: fd.get("echoesOptIn") === "on",
    isDraft: false,
    authorName: state.user?.displayName || state.user?.email || "You",
    createdAt: new Date().toISOString(),
  };
  try {
    await addDoc(collection(state.db, "users", state.user.uid, "entries"), payload);
    if (payload.globalSubject) {
      const match = state.globalBios.find((bio) => bio.subject.toLowerCase() === payload.globalSubject.toLowerCase());
      if (match) {
        const shouldAdd = window.confirm(`Add this to ${match.subject}'s Active Biography on Global?`);
        if (shouldAdd) {
          addContributionToBio(match.id, { body: payload.body, writer: payload.authorName });
          state.activeBioId = match.id;
          setActivePage("global");
          renderGlobal();
        }
      }
    }
    clearForm();
    closeDrawer();
  } catch (e) {
    console.error(e);
    alert("Could not save entry.");
  }
});

on(releaseTarget, "change", () => {
  ids.individualOptions.classList.toggle("hidden", ids.releaseTarget.value !== "person");
});
on(ids.editorToolbar, "click", (e) => {
  const btn = e.target.closest("[data-editor-command]");
  if (!btn) return;
  const command = btn.dataset.editorCommand;
  ids.entryBodyEditor?.focus();
  document.execCommand(command, false);
  updateEditorMetrics();
});
on(ids.entryBodyEditor, "input", () => {
  $("entry-body").value = normalizeEditorText();
  updateEditorMetrics();
});
on(scheduleToggleBtn, "click", () => {
  ids.scheduleToggle.checked = !ids.scheduleToggle.checked;
  ids.scheduleOptions.classList.toggle("hidden", !ids.scheduleToggle.checked);
  ids.scheduleToggleBtn.classList.toggle("open", ids.scheduleToggle.checked);
});
on(sectionChips, "click", (e) => {
  const target = e.target.closest(".chip");
  if (!target) return;
  ids.sectionChips.querySelectorAll(".chip").forEach((el) => el.classList.remove("active"));
  target.classList.add("active");
  $("entry-category").value = target.dataset.category;
});
on(visibilityGroup, "click", (e) => {
  const target = e.target.closest(".visibility-btn");
  if (!target) return;
  ids.visibilityGroup.querySelectorAll(".visibility-btn").forEach((el) => el.classList.remove("active"));
  target.classList.add("active");
  $("entry-audience").value = target.dataset.audience;
});
on(ids.settingsVisibilityGroup, "click", (e) => {
  const target = e.target.closest("[data-default-audience]");
  if (!target) return;
  state.settings.defaultAudience = target.dataset.defaultAudience;
  applySettingsToUi();
});
on(ids.saveSettingsBtn, "click", async () => {
  if (settingsStatusTimer) clearTimeout(settingsStatusTimer);
  const displayName = String(ids.settingsDisplayName?.value || "").trim();
  const username = normalizeUsername(ids.settingsUsername?.value || "");
  const bio = String(ids.settingsBio?.value || "").trim();
  if (!displayName) return setSettingsStatus("Display name is required.", "error");
  if (!username) return setSettingsStatus("Username is required.", "error");
  if (!USERNAME_RE.test(username)) return setSettingsStatus("Username must be 3-24 chars: lowercase letters, numbers, '.' or '_'.", "error");
  setSaveButtonBusy(true);
  state.settings.displayName = displayName;
  state.settings.username = username;
  state.settings.bio = bio;
  state.settings.defaultEchoesOptIn = Boolean(ids.settingsEchoesOptIn?.checked);
  const persistOnly = () => {
    persistSettings();
    applySettingsToUi();
    setAuthUi();
  };
  if (!state.user || !state.db) {
    persistOnly();
    setSettingsStatus("Saved locally. Sign in to reserve this username globally.", "success");
    setSaveButtonBusy(false);
    settingsStatusTimer = setTimeout(() => setSettingsStatus(""), 2600);
    return;
  }
  try {
    await claimUsername({ uid: state.user.uid, username, displayName, bio });
    persistOnly();
    setSettingsStatus("Saved. Username claimed successfully.", "success");
    settingsStatusTimer = setTimeout(() => setSettingsStatus(""), 2600);
  } catch (err) {
    setSettingsStatus(err.message || "Could not save profile.", "error");
  } finally {
    setSaveButtonBusy(false);
  }
});

ids.sectionTabs.forEach((tab) =>
  on(tab, "click", () => {
    state.journalSection = tab.dataset.section;
    localStorage.setItem(JOURNAL_SECTION_KEY, state.journalSection);
    ids.sectionTabs.forEach((el) => el.classList.toggle("active", el === tab));
    renderEntries();
  })
);
ids.circleTabs.forEach((tab) =>
  on(tab, "click", () => {
    ids.circleTabs.forEach((el) => el.classList.toggle("active", el === tab));
    $("circle-family").classList.toggle("hidden", tab.dataset.circleTab !== "family");
    $("circle-friends").classList.toggle("hidden", tab.dataset.circleTab !== "friends");
  })
);
ids.letterTabs.forEach((tab) =>
  on(tab, "click", () => {
    ids.letterTabs.forEach((el) => el.classList.toggle("active", el === tab));
    $("letters-outbox").classList.toggle("hidden", tab.dataset.letterTab !== "outbox");
    $("letters-inbox").classList.toggle("hidden", tab.dataset.letterTab !== "inbox");
  })
);

on(timelineSectionFilter, "change", renderTimeline);
on(timelinePersonFilter, "input", renderTimeline);
on(timelineYearFilter, "input", renderTimeline);
on(timelineMonthFilter, "change", renderTimeline);
on(timelineDayFilter, "input", renderTimeline);
on(timelineTimeFilter, "change", renderTimeline);
on(ids.timelineClearBtn, "click", () => {
  ids.timelineSectionFilter.value = "All";
  ids.timelinePersonFilter.value = "";
  ids.timelineYearFilter.value = "";
  ids.timelineMonthFilter.value = "";
  ids.timelineDayFilter.value = "";
  ids.timelineTimeFilter.value = "";
  renderTimeline();
});
on(timelineToggleBtn, "click", () => {
  state.timelineMode = state.timelineMode === "my" ? "family" : "my";
  ids.timelineToggleBtn.textContent = state.timelineMode === "my" ? "My Story" : "Family Story";
  renderTimeline();
});

on(ids.globalSearch, "input", renderGlobal);
on(ids.globalFilters, "click", (e) => {
  const target = e.target.closest("[data-global-filter]");
  if (!target) return;
  state.globalFilter = target.dataset.globalFilter;
  ids.globalFilters.querySelectorAll(".chip").forEach((el) => el.classList.toggle("active", el === target));
  renderGlobal();
});
on(ids.globalCards, "click", (e) => {
  const target = e.target.closest("[data-open-bio]");
  if (!target) return;
  state.activeBioId = target.dataset.openBio;
  renderActiveBio();
});
on(ids.closeBioBtn, "click", () => {
  state.activeBioId = null;
  ids.activeBiography.classList.add("hidden");
});
on(ids.startBiographyBtn, "click", () => {
  ids.globalModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
});
on(ids.globalModalClose, "click", () => {
  ids.globalModal.classList.add("hidden");
  if (ids.entryDrawer.classList.contains("hidden") && ids.authModal.classList.contains("hidden")) document.body.style.overflow = "";
});
on(ids.globalModal, "click", (e) => {
  if (e.target !== ids.globalModal) return;
  ids.globalModal.classList.add("hidden");
  if (ids.entryDrawer.classList.contains("hidden") && ids.authModal.classList.contains("hidden")) document.body.style.overflow = "";
});
on(ids.createBioBtn, "click", () => {
  const subject = String(ids.bioSubjectInput.value || "").trim();
  if (!subject) return alert("Subject name is required.");
  const tag = String(ids.bioTaglineInput.value || "").trim();
  const category = String(ids.bioCategoryInput.value || "People");
  const coverImage = String(ids.bioCoverInput.value || "").trim();
  const now = new Date().toISOString();
  const starter = {
    id: `bio_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    subject,
    tagline: tag,
    category,
    coverImage,
    createdAt: now,
    updatedAt: now,
    contributions: [
      {
        id: `c_${Date.now()}_0`,
        writer: state.user?.displayName || state.settings.displayName || "Anonymous",
        createdAt: now,
        body: `Opening contribution for ${subject}.`,
      },
    ],
  };
  state.globalBios.unshift(starter);
  persistGlobalBios();
  ids.globalModal.classList.add("hidden");
  ids.bioSubjectInput.value = "";
  ids.bioTaglineInput.value = "";
  ids.bioCoverInput.value = "";
  state.activeBioId = starter.id;
  if (ids.entryDrawer.classList.contains("hidden") && ids.authModal.classList.contains("hidden")) document.body.style.overflow = "";
  setActivePage("global");
  renderGlobal();
});
on(ids.addBioEntryBtn, "click", () => {
  const bio = state.globalBios.find((x) => x.id === state.activeBioId);
  if (!bio) return;
  const text = window.prompt(`Add a contribution to ${bio.subject}:`);
  if (!text || !text.trim()) return;
  addContributionToBio(bio.id, {
    body: text,
    writer: state.user?.displayName || state.settings.displayName || "Anonymous",
  });
  renderGlobal();
});
on(ids.bioContributions, "click", (e) => {
  const target = e.target.closest("[data-report-id]");
  if (!target) return;
  alert("Thanks. This contribution has been flagged for review.");
});
on(ids.dailyPromptInput, "input", () => {
  ids.dailyPromptInput.style.height = "auto";
  ids.dailyPromptInput.style.height = `${Math.max(88, ids.dailyPromptInput.scrollHeight)}px`;
});
document.body.addEventListener("click", (e) => {
  const link = e.target.closest("[data-page-link]");
  if (!link) return;
  setActivePage(link.dataset.pageLink);
});

on(newEntryBtn, "click", () => openDrawer(false));
on(quickWriteBtn, "click", () => openDrawer(false));
on(ids.startFirstEntryBtn, "click", () => openDrawer(false));
on(writeLetterBtn, "click", () => openDrawer(true));
on(entryDrawerClose, "click", closeDrawer);
on(entryDrawer, "click", (e) => {
  if (e.target === ids.entryDrawer) closeDrawer();
});

on(bannerSignInBtn, "click", () => showAuthModal("save your story"));
on(authModalClose, "click", hideAuthModal);
on(onboardingNextBtn, "click", () => {
  if (state.onboardingStep < onboardingSlides.length - 1) {
    state.onboardingStep += 1;
    updateOnboarding();
    return;
  }
  state.onboardingCompleted = true;
  ids.onboardingPanel.classList.add("hidden");
  ids.authLoginPanel.classList.remove("hidden");
  ids.authBar.classList.remove("hidden");
});
on(onboardingBackBtn, "click", () => {
  if (state.onboardingStep === 0) return;
  state.onboardingStep -= 1;
  updateOnboarding();
});
on(backToOnboardingBtn, "click", () => {
  state.onboardingCompleted = false;
  state.onboardingStep = 0;
  ids.onboardingPanel.classList.remove("hidden");
  ids.authLoginPanel.classList.add("hidden");
  ids.authBar.classList.add("hidden");
  updateOnboarding();
});
on(ids.continueGuestBtn, "click", hideAuthModal);
on(authModal, "click", (e) => {
  if (e.target === ids.authModal) hideAuthModal();
});

on(sidebarNav, "click", (e) => {
  const target = e.target.closest(".nav-item");
  if (!target) return;
  setActivePage(target.dataset.page);
});
on(ids.lettersOutboxList, "click", (e) => {
  const target = e.target.closest("#letters-first-btn");
  if (!target) return;
  openDrawer(true);
});
on(ids.letterPrompts, "click", (e) => {
  const target = e.target.closest("[data-letter-title]");
  if (!target) return;
  if (showAuthModal("write this letter")) return;
  openDrawer(true);
  $("entry-title").value = target.dataset.letterTitle || "";
  setEditorContent(target.dataset.letterBody || "");
});
ids.mobileTabs.forEach((tab) => on(tab, "click", () => setActivePage(tab.dataset.page)));
ids.authActionButtons.forEach((btn) =>
  on(btn, "click", (e) => {
    if (state.user) return;
    e.preventDefault();
    showAuthModal(btn.dataset.actionLabel || "continue");
  })
);

parseSettings();
parseGlobalBios();
seedGlobalBios();
applySettingsToUi();
if (ids.dailyPrompt) {
  const dayIndex = new Date().getDay() % DAILY_PROMPTS.length;
  ids.dailyPrompt.textContent = DAILY_PROMPTS[dayIndex];
}
updateEditorMetrics();
setActivePage(state.activePage);
ids.sectionTabs.forEach((el) => el.classList.toggle("active", el.dataset.section === state.journalSection));
setAuthUi();
rerender();

document.body.addEventListener("click", async (e) => {
  const btn = e.target.closest("#ai-generate-btn");
  if (!btn || !state.user) return;
  btn.disabled = true;
  try {
    const entries = state.entries.filter((entry) => entry.aiOptIn && isReleased(entry)).slice(0, 12);
    const prompt = `Write a warm two-paragraph reflection from these entries:\n\n${entries.map((x, i) => `Entry ${i + 1}: ${x.title}\n${x.body || ""}`).join("\n\n---\n\n")}`;
    const response = await fetch(REPLICATE_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ model: AI_REFLECTION_MODEL, input: { prompt, max_tokens: 600 } }),
    });
    const prediction = await response.json();
    if (!response.ok) throw new Error(prediction?.detail ?? prediction?.error ?? "Request failed");
    normalizeReplicateOutput(prediction);
  } catch (err) {
    console.error(err);
  } finally {
    btn.disabled = false;
  }
});
