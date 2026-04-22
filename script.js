const STORAGE_KEY = "echoes_journal_entries_v1";

const form = document.getElementById("entry-form");
const entriesList = document.getElementById("entries-list");
const timelineList = document.getElementById("family-timeline");
const audienceField = document.getElementById("entry-audience");
const individualOptions = document.getElementById("individual-options");
const scheduleToggle = document.getElementById("schedule-toggle");
const scheduleOptions = document.getElementById("schedule-options");
const filterCategory = document.getElementById("filter-category");
const filterAudience = document.getElementById("filter-audience");
const aiPanel = document.getElementById("ai-panel");
const seedButton = document.getElementById("seed-demo");

const getEntries = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (error) {
    return [];
  }
};

const saveEntries = (entries) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
};

const isReleased = (entry) => {
  if (!entry.isScheduled) return true;
  return Date.now() >= new Date(entry.releaseDate).getTime();
};

const formatDate = (isoString) => new Date(isoString).toLocaleString();

const clearForm = () => {
  form.reset();
  individualOptions.classList.add("hidden");
  scheduleOptions.classList.add("hidden");
};

const renderEntries = () => {
  const entries = getEntries();
  const categoryFilter = filterCategory.value;
  const audienceFilter = filterAudience.value;

  const visibleEntries = entries
    .filter(isReleased)
    .filter((entry) => categoryFilter === "All" || entry.category === categoryFilter)
    .filter((entry) => audienceFilter === "All" || entry.audience === audienceFilter)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (visibleEntries.length === 0) {
    entriesList.innerHTML = "<li class='muted'>No entries match your filters yet.</li>";
    return;
  }

  entriesList.innerHTML = visibleEntries
    .map((entry) => {
      const scheduleText = entry.isScheduled ? `Released: ${formatDate(entry.releaseDate)}` : "Available now";
      const recipientText =
        entry.audience === "Individual" && entry.recipientName
          ? `For ${entry.recipientName} via ${entry.deliveryMethod || "Portal"}`
          : null;

      return `
        <li class="entry-item">
          <h3>${entry.title}</h3>
          <p class="entry-meta">
            <span class="pill">${entry.category}</span>
            <span class="pill">${entry.audience}</span>
            ${entry.aiOptIn ? '<span class="pill">AI Opt-In</span>' : ""}
          </p>
          <p>${entry.body}</p>
          <p class="entry-meta">
            Created: ${formatDate(entry.createdAt)} | ${scheduleText}
            ${recipientText ? `<br>${recipientText}` : ""}
          </p>
        </li>
      `;
    })
    .join("");
};

const renderFamilyTimeline = () => {
  const entries = getEntries();
  const familyEntries = entries
    .filter((entry) => isReleased(entry))
    .filter((entry) => entry.audience === "Family" || entry.category === "Family")
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  if (familyEntries.length === 0) {
    timelineList.innerHTML = "<li class='muted'>No family-linked entries yet.</li>";
    return;
  }

  timelineList.innerHTML = familyEntries
    .map(
      (entry) => `
      <li class="entry-item">
        <strong>${entry.title}</strong><br>
        <span class="entry-meta">${formatDate(entry.createdAt)} • ${entry.category}</span>
      </li>
    `
    )
    .join("");
};

const renderAIInsights = () => {
  const entries = getEntries().filter((entry) => entry.aiOptIn && isReleased(entry));
  if (entries.length === 0) {
    aiPanel.innerHTML = "<p>No AI insights yet. Save entries with AI opt-in to preview grouped themes.</p>";
    return;
  }

  const byCategory = entries.reduce((acc, entry) => {
    acc[entry.category] = (acc[entry.category] || 0) + 1;
    return acc;
  }, {});

  const topThemes = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([theme, count]) => `${theme} (${count})`)
    .join(", ");

  const uplifting = entries
    .filter((entry) => /grateful|proud|happy|hopeful|peace/i.test(entry.body))
    .slice(0, 2)
    .map((entry) => `"${entry.title}"`)
    .join(", ");

  aiPanel.innerHTML = `
    <p class="success">Preview AI summary (local placeholder):</p>
    <p><strong>Recurring themes:</strong> ${topThemes || "Not enough data yet"}.</p>
    <p><strong>Uplifting moments to revisit:</strong> ${uplifting || "None flagged yet"}.</p>
    <p class="muted">
      Later this can connect to a real AI backend for private reflection prompts, related-story matching,
      and emotional trend analysis.
    </p>
  `;
};

const rerenderAll = () => {
  renderEntries();
  renderFamilyTimeline();
  renderAIInsights();
};

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(form);

  const isScheduled = formData.get("isScheduled") === "on";
  const releaseDate = formData.get("releaseDate");
  if (isScheduled && !releaseDate) {
    alert("Please choose a release date/time for your scheduled entry.");
    return;
  }

  const audience = formData.get("audience");
  if (audience === "Individual" && !formData.get("recipientName")) {
    alert("Please enter a recipient name for individual release.");
    return;
  }

  const newEntry = {
    id: crypto.randomUUID(),
    title: String(formData.get("title")).trim(),
    category: String(formData.get("category")),
    body: String(formData.get("body")).trim(),
    audience,
    recipientName: String(formData.get("recipientName") || "").trim(),
    deliveryMethod: String(formData.get("deliveryMethod") || ""),
    isScheduled,
    releaseDate: isScheduled ? String(releaseDate) : "",
    aiOptIn: formData.get("aiOptIn") === "on",
    createdAt: new Date().toISOString(),
  };

  const entries = getEntries();
  entries.push(newEntry);
  saveEntries(entries);
  clearForm();
  rerenderAll();
});

audienceField.addEventListener("change", () => {
  const showIndividual = audienceField.value === "Individual";
  individualOptions.classList.toggle("hidden", !showIndividual);
});

scheduleToggle.addEventListener("change", () => {
  scheduleOptions.classList.toggle("hidden", !scheduleToggle.checked);
});

filterCategory.addEventListener("change", rerenderAll);
filterAudience.addEventListener("change", rerenderAll);

seedButton.addEventListener("click", () => {
  const current = getEntries();
  if (current.length > 0) {
    alert("Demo is only for empty journals. Clear local storage if you want to reload it.");
    return;
  }

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const demo = [
    {
      id: crypto.randomUUID(),
      title: "The day grandma told her migration story",
      category: "Family",
      body: "I recorded everything she remembered from the journey and saved photos with it.",
      audience: "Family",
      recipientName: "",
      deliveryMethod: "",
      isScheduled: false,
      releaseDate: "",
      aiOptIn: true,
      createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: crypto.randomUUID(),
      title: "Letter for future me",
      category: "Lessons",
      body: "I am proud of staying consistent and hopeful through hard changes.",
      audience: "Self",
      recipientName: "",
      deliveryMethod: "",
      isScheduled: true,
      releaseDate: tomorrow.toISOString().slice(0, 16),
      aiOptIn: true,
      createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: crypto.randomUUID(),
      title: "Public reflection after a milestone",
      category: "Big Moments",
      body: "Sharing this in real time felt more human than waiting years for a book.",
      audience: "Public",
      recipientName: "",
      deliveryMethod: "",
      isScheduled: false,
      releaseDate: "",
      aiOptIn: false,
      createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  saveEntries(demo);
  rerenderAll();
});

rerenderAll();
