import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, query, orderBy, onSnapshot, addDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const NAV_KEY = "written_active_page";
const JOURNAL_SECTION_KEY = "written_journal_section";
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
};

const onboardingSlides = [
  "Start private by default. Nothing is shared unless you choose to share it.",
  "Share selectively: only you, family, or public when the moment feels right.",
  "Write letters for the future and set when they should arrive.",
  "Reflect gently with AI when you opt in - always your choice, never forced.",
];

const ids = {
  form: $("entry-form"), entriesList: $("entries-list"), timelineList: $("timeline-list"),
  previewBanner: $("preview-banner"), authSetupHint: $("auth-setup-hint"), authBar: $("auth-bar"),
  authGuestPanel: $("auth-guest-panel"), authSignedInPanel: $("auth-signed-in"), authUserLabel: $("auth-user-label"),
  sidebarUserName: $("sidebar-user-name"),
  signOutBtn: $("sign-out-btn"), googleSignInBtn: $("google-sign-in-btn"), bannerSignInBtn: $("banner-sign-in-btn"),
  authModal: $("auth-modal"), authModalClose: $("auth-modal-close"), authContextTitle: $("auth-context-title"),
  authContextCopy: $("auth-context-copy"), onboardingPanel: $("onboarding-panel"), authLoginPanel: $("auth-login-panel"),
  onboardingCopy: $("onboarding-copy"), onboardingNextBtn: $("onboarding-next-btn"), onboardingBackBtn: $("onboarding-back-btn"),
  backToOnboardingBtn: $("back-to-onboarding-btn"), onboardingDots: $$(".onboarding-dot"), sidebarNav: $("sidebar-nav"),
  navItems: $$(".nav-item"), mobileTabs: $$(".mobile-tab"), pages: $$(".page"), sectionTabs: $$(".section-tab"),
  circleTabs: $$('[data-circle-tab]'), letterTabs: $$('[data-letter-tab]'), newEntryBtn: $("new-entry-btn"),
  quickWriteBtn: $("quick-write-btn"), writeLetterBtn: $("write-letter-btn"), entryDrawer: $("entry-drawer"),
  entryDrawerClose: $("entry-drawer-close"), scheduleToggleBtn: $("schedule-toggle-btn"), scheduleToggle: $("schedule-toggle"),
  scheduleOptions: $("schedule-options"), releaseTarget: $("release-target"), individualOptions: $("individual-options"),
  sectionChips: $("section-chips"), visibilityGroup: $("visibility-group"), timelineSectionFilter: $("timeline-section-filter"),
  timelineDateFilter: $("timeline-date-filter"), timelineToggleBtn: $("timeline-toggle-btn"), lettersOutboxList: $("letters-outbox-list"),
  echoesFeed: $("echoes-feed"), greetingTitle: $("greeting-title"), continueCard: $("continue-card"), arrivingSoon: $("arriving-soon"),
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
  timelineDateFilter,
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
const isReleased = (e) => !e.isScheduled || Date.now() >= new Date(e.releaseDate).getTime();
const getStatus = (e) => (e.isDraft ? "draft" : !e.isScheduled ? "published" : isReleased(e) ? "delivered" : "time-locked");
const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");

const setActivePage = (page) => {
  state.activePage = page;
  localStorage.setItem(NAV_KEY, page);
  ids.pages.forEach((el) => el.classList.toggle("active", el.dataset.page === page));
  ids.navItems.forEach((el) => el.classList.toggle("active", el.dataset.page === page));
  ids.mobileTabs.forEach((el) => el.classList.toggle("active", el.dataset.page === page));
};

const setAuthUi = () => {
  if (!isFirebaseConfigured()) {
    ids.authSetupHint.classList.remove("hidden");
    ids.previewBanner.classList.remove("hidden");
    return;
  }
  ids.authSetupHint.classList.add("hidden");
  const signedIn = Boolean(state.user);
  ids.authGuestPanel.classList.toggle("hidden", signedIn);
  ids.authSignedInPanel.classList.toggle("hidden", !signedIn);
  ids.previewBanner.classList.toggle("hidden", signedIn);
  if (signedIn) {
    const who = state.user.displayName?.trim() || state.user.email || state.user.uid;
    ids.authUserLabel.textContent = `Signed in as ${who}`;
    ids.sidebarUserName.textContent = who;
  } else {
    ids.authUserLabel.textContent = "";
    ids.sidebarUserName.textContent = "Guest Writer";
  }
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const name = state.user?.displayName?.trim() || (state.user?.email ? state.user.email.split("@")[0] : "Writer");
  ids.greetingTitle.textContent = `Good ${part}, ${name}`;
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
  ids.onboardingCopy.textContent = onboardingSlides[state.onboardingStep];
  ids.onboardingDots.forEach((dot, i) => dot.classList.toggle("active", i === state.onboardingStep));
  ids.onboardingBackBtn.classList.toggle("hidden", state.onboardingStep === 0);
  ids.onboardingNextBtn.textContent = state.onboardingStep === onboardingSlides.length - 1 ? "Continue to sign in" : "Next";
};

const openDrawer = (asLetter = false) => {
  $("drawer-title").textContent = asLetter ? "Write a Letter" : "New Entry";
  if (!state.user) return showAuthModal(asLetter ? "send this letter" : "save your entry");
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
  $("entry-audience").value = "Self";
  ids.sectionChips.querySelectorAll(".chip").forEach((el) => el.classList.remove("active"));
  ids.visibilityGroup.querySelectorAll(".visibility-btn").forEach((el) => el.classList.remove("active"));
  ids.sectionChips.querySelector('[data-category="Love"]')?.classList.add("active");
  ids.visibilityGroup.querySelector('[data-audience="Self"]')?.classList.add("active");
  ids.scheduleToggle.checked = false;
  ids.scheduleOptions.classList.add("hidden");
  ids.scheduleToggleBtn.classList.remove("open");
  ids.individualOptions.classList.add("hidden");
};

const renderEntries = () => {
  const entries = state.entries
    .map((e) => ({ ...e, createdAt: normalizeDate(e) }))
    .filter(isReleased)
    .filter((e) => state.journalSection === "All" || e.category === state.journalSection)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (entries.length === 0) {
    ids.entriesList.innerHTML = "<li class='entry-item muted'>Your first entry is waiting to be written.</li>";
    ids.continueCard.textContent = "No unfinished entry yet. Start a thought and come back anytime.";
    ids.arrivingSoon.textContent = "No time-released letters are arriving soon.";
    ids.lettersOutboxList.innerHTML = "<li class='entry-item muted'>No letters scheduled yet.</li>";
    return;
  }

  const soon = entries.filter((e) => e.isScheduled && !isReleased(e)).sort((a, b) => new Date(a.releaseDate) - new Date(b.releaseDate))[0];
  ids.arrivingSoon.textContent = soon
    ? `A letter to ${soon.deliveryMethod || "yourself"} opens in ${Math.max(1, Math.ceil((new Date(soon.releaseDate).getTime() - Date.now()) / (24 * 3600 * 1000)))} day(s).`
    : "No time-released letters are arriving soon.";
  ids.continueCard.textContent = `Continue "${entries[0].title}" from ${fmtShort(entries[0].createdAt)}.`;

  ids.entriesList.innerHTML = entries
    .map((e) => `<li class="entry-item"><div class="entry-head"><span class="pill">${esc(e.category)}</span><span class="status-badge">${getStatus(e)}</span></div><h3>${esc(e.title)}</h3><p class="entry-preview">${esc(e.body || "").slice(0, 170)}...</p><p class="muted">${fmt(e.createdAt)} • <span class="pill">${esc(e.audience || "Self")}</span></p></li>`)
    .join("");

  ids.lettersOutboxList.innerHTML = entries
    .filter((e) => e.category === "Letters" || e.isScheduled)
    .slice(0, 8)
    .map((e) => `<li class="entry-item"><strong>${esc(e.title)}</strong><div class="muted">${esc(e.deliveryMethod || "me")} • ${fmtShort(e.releaseDate || e.createdAt)} • ${getStatus(e)}</div></li>`)
    .join("");
};

const renderTimeline = () => {
  const section = ids.timelineSectionFilter.value;
  const month = ids.timelineDateFilter.value;
  const entries = state.entries
    .map((e) => ({ ...e, createdAt: normalizeDate(e) }))
    .filter(isReleased)
    .filter((e) => section === "All" || e.category === section)
    .filter((e) => !month || e.createdAt.slice(0, 7) === month)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  ids.timelineList.innerHTML =
    entries.length === 0
      ? "<li class='timeline-item muted'>No timeline entries for this filter yet.</li>"
      : entries
          .map((e) => `<li class="timeline-item"><strong>${esc(e.title)}</strong><div>${esc(e.category)} • ${state.timelineMode === "family" ? esc(e.authorName || "Family") : "You"}</div><div class="muted">${fmt(e.createdAt)}</div></li>`)
          .join("");
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

const rerender = () => {
  renderEntries();
  renderTimeline();
  renderEchoes();
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
  const fd = new FormData(form);
  const isScheduled = fd.get("isScheduled") === "on";
  const releaseDate = fd.get("releaseDate");
  if (isScheduled && !releaseDate) return alert("Please choose a release date/time.");
  if (fd.get("releaseTarget") === "person" && !fd.get("recipientName")) return alert("Please enter a recipient name.");
  const payload = {
    title: String(fd.get("title") || "").trim(),
    category: String(fd.get("category") || "Love"),
    body: String(fd.get("body") || "").trim(),
    audience: String(fd.get("audience") || "Self"),
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
on(timelineDateFilter, "change", renderTimeline);
on(timelineToggleBtn, "click", () => {
  state.timelineMode = state.timelineMode === "my" ? "family" : "my";
  ids.timelineToggleBtn.textContent = state.timelineMode === "my" ? "My Story" : "Family Story";
  renderTimeline();
});

on(newEntryBtn, "click", () => openDrawer(false));
on(quickWriteBtn, "click", () => openDrawer(false));
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
on(authModal, "click", (e) => {
  if (e.target === ids.authModal) hideAuthModal();
});

on(sidebarNav, "click", (e) => {
  const target = e.target.closest(".nav-item");
  if (!target) return;
  setActivePage(target.dataset.page);
});
ids.mobileTabs.forEach((tab) => on(tab, "click", () => setActivePage(tab.dataset.page)));
ids.authActionButtons.forEach((btn) =>
  on(btn, "click", (e) => {
    if (state.user) return;
    e.preventDefault();
    showAuthModal(btn.dataset.actionLabel || "continue");
  })
);

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
