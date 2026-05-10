let currentQuiz = null;
let cachedWords = [];

const $ = (id) => document.getElementById(id);
const REVIEW_KEY = "wapilot0001_reviews_v1";
const HIDDEN_KEY = "wapilot0001_hidden_words_v1";

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2200);
}

async function api(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail || JSON.stringify(data);
    } catch (_) {}
    throw new Error(detail);
  }
  return res.json();
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch (_) {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function wordKey(w) {
  return `${w.japanese || ""}|${w.reading || ""}`;
}

function getReviews() {
  return readJson(REVIEW_KEY, {});
}

function saveReviews(reviews) {
  writeJson(REVIEW_KEY, reviews);
}

function getHiddenWords() {
  return readJson(HIDDEN_KEY, []);
}

function saveHiddenWords(keys) {
  writeJson(HIDDEN_KEY, keys);
}

function nextReviewDate(result) {
  const d = new Date();
  const days = { forgot: 0, hard: 1, good: 3, easy: 7 }[result] ?? 1;
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function mergeReview(w) {
  const r = getReviews()[wordKey(w)] || {};
  return {
    ...w,
    review_status: r.status || w.review_status || "new",
    review_count: r.review_count || 0,
    correct_count: r.correct_count || 0,
    wrong_count: r.wrong_count || 0,
    last_reviewed_at: r.last_reviewed_at || null,
    next_review_at: r.next_review_at || null,
  };
}

function visibleWords(words) {
  const hidden = new Set(getHiddenWords());
  return words.map(mergeReview).filter(w => !hidden.has(wordKey(w)));
}

async function getWords() {
  if (!cachedWords.length) {
    cachedWords = await api("/api/words?limit=5000");
  }
  return visibleWords(cachedWords);
}

function isDue(w) {
  if (!w.next_review_at) return true;
  return new Date(w.next_review_at).getTime() <= Date.now();
}

function speak(text) {
  if (!text) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  u.rate = 0.92;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[m]));
}

function setView(id) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  $(id).classList.add("active");
  document.querySelector(`.nav-btn[data-target="${id}"]`).classList.add("active");

  if (id === "dashboard") loadStats();
  if (id === "vocab") loadWords();
  if (id === "packs") loadPacks();
}

async function loadStats() {
  const words = await getWords();
  const reviewed = words.filter(w => w.review_count > 0);
  const correct = reviewed.reduce((sum, w) => sum + (w.correct_count || 0), 0);
  const totalReviews = reviewed.reduce((sum, w) => sum + (w.review_count || 0), 0);
  $("statTotal").textContent = words.length;
  $("statDue").textContent = words.filter(isDue).length;
  $("statLearned").textContent = reviewed.length;
  $("statAccuracy").textContent = `${totalReviews ? Math.round((correct / totalReviews) * 100) : 0}%`;
}

async function loadDue() {
  const data = (await getWords()).filter(isDue).slice(0, 24);
  const el = $("dueList");
  el.innerHTML = data.length ? "" : `<p class="muted">No due words. Import a pack or study more.</p>`;
  data.forEach(w => el.appendChild(wordCard(w)));
}

function wordCard(w) {
  const div = document.createElement("article");
  div.className = "word-card";
  div.innerHTML = `
    <div class="jp">${escapeHtml(w.japanese)} <span class="reading">${escapeHtml(w.reading)}</span></div>
    <div class="en">${escapeHtml(w.meaning_en)}</div>
    <div class="meta">${escapeHtml(w.part_of_speech)} · ${escapeHtml(w.jlpt_level)} · ${escapeHtml(w.review_status)}</div>
    <div class="tags">${(w.tags_list || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>
    <div class="actions" style="margin-top:12px">
      <button class="ghost-btn" data-speak="${escapeHtml(w.japanese)}">🔊</button>
      <button class="secondary-btn" data-study-key="${escapeHtml(wordKey(w))}">Study</button>
    </div>
  `;
  div.querySelector("[data-speak]").addEventListener("click", e => speak(e.currentTarget.dataset.speak));
  div.querySelector("[data-study-key]").addEventListener("click", e => startSpecificQuiz(e.currentTarget.dataset.studyKey));
  return div;
}

async function loadWords() {
  const q = $("searchInput").value.toLowerCase();
  const level = $("levelFilter").value;
  const part = $("partFilter").value.toLowerCase();
  const tag = $("tagFilter").value.toLowerCase();
  const status = $("statusFilter").value;
  let data = await getWords();
  data = data.filter(w => {
    const haystack = [w.japanese, w.reading, w.meaning_en, w.meaning_ko, w.example_jp, w.example_en, w.example_ko].join(" ").toLowerCase();
    const tags = (w.tags_list || []).join(" ").toLowerCase();
    return (!q || haystack.includes(q)) &&
      (!level || w.jlpt_level === level) &&
      (!part || String(w.part_of_speech || "").toLowerCase().includes(part)) &&
      (!tag || tags.includes(tag)) &&
      (!status || w.review_status === status);
  }).slice(0, 1000);

  const el = $("wordList");
  el.innerHTML = data.length ? "" : `<p class="muted">No words found.</p>`;

  data.forEach(w => {
    const div = document.createElement("article");
    div.className = "word-row";
    div.innerHTML = `
      <div>
        <div class="jp">${escapeHtml(w.japanese)} <span class="reading">${escapeHtml(w.reading)}</span></div>
        <div class="en">${escapeHtml(w.meaning_en)}</div>
        <div class="meta">${escapeHtml(w.meaning_ko)} · ${escapeHtml(w.part_of_speech)} · ${escapeHtml(w.jlpt_level)} · status: ${escapeHtml(w.review_status)} · reviews: ${w.review_count}</div>
        ${w.example_jp ? `<div class="example-text">例: ${escapeHtml(w.example_jp)}<br>${escapeHtml(w.example_en)}</div>` : ""}
        <div class="tags">${(w.tags_list || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>
      </div>
      <div class="actions">
        <button class="ghost-btn" data-speak="${escapeHtml(w.japanese)}">🔊 JP</button>
        <button class="ghost-btn" data-speak="${escapeHtml(w.example_jp || w.japanese)}">🔊 Example</button>
        <button class="review-btn good" data-review-key="${escapeHtml(wordKey(w))}" data-result="good">Good</button>
        <button class="review-btn danger" data-hide-key="${escapeHtml(wordKey(w))}">Hide</button>
      </div>
    `;
    el.appendChild(div);
  });

  el.querySelectorAll("[data-speak]").forEach(btn => btn.addEventListener("click", () => speak(btn.dataset.speak)));
  el.querySelectorAll("[data-hide-key]").forEach(btn => btn.addEventListener("click", async () => {
    if (!confirm("Hide this word from this browser?")) return;
    const hidden = new Set(getHiddenWords());
    hidden.add(btn.dataset.hideKey);
    saveHiddenWords([...hidden]);
    toast("Hidden locally");
    loadWords();
    loadStats();
  }));
  el.querySelectorAll("[data-review-key]").forEach(btn => btn.addEventListener("click", async () => {
    updateLocalReview(btn.dataset.reviewKey, btn.dataset.result, "manual");
    toast("Review saved locally");
    loadWords();
    loadStats();
  }));
}

function renderCurrentWord(w) {
  $("currentWordDetail").classList.remove("empty");
  $("currentWordDetail").innerHTML = `
    <div class="jp">${escapeHtml(w.japanese)} <span class="reading">${escapeHtml(w.reading)}</span></div>
    <p><b>EN:</b> ${escapeHtml(w.meaning_en)}</p>
    <p><b>KO:</b> ${escapeHtml(w.meaning_ko)}</p>
    <p><b>Part:</b> ${escapeHtml(w.part_of_speech)} / <b>Level:</b> ${escapeHtml(w.jlpt_level)}</p>
    <p><b>Status:</b> ${escapeHtml(w.review_status)} / <b>Reviews:</b> ${w.review_count}</p>
    <p><b>Example JP:</b><br>${escapeHtml(w.example_jp)}</p>
    <p><b>Example EN:</b><br>${escapeHtml(w.example_en)}</p>
    <div class="tags">${(w.tags_list || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>
  `;
}

function makeQuiz(w, mode) {
  const exampleBlank = (w.example_jp || "").replace(w.japanese, "_____");
  const map = {
    jp_en: { hint: "Translate Japanese to English", question: w.japanese, answer: w.meaning_en },
    en_jp: { hint: "Recall Japanese from English", question: w.meaning_en, answer: `${w.japanese} (${w.reading})` },
    reading: { hint: "Read the kanji", question: w.japanese, answer: w.reading },
    example: { hint: "Fill the blank in the example", question: exampleBlank || w.meaning_en, answer: w.japanese },
  };
  return { ...(map[mode] || map.jp_en), mode, word: w, example_jp: w.example_jp, example_en: w.example_en };
}

async function newQuiz() {
  const mode = $("quizMode").value;
  const dueOnly = $("dueOnlyQuiz").checked;
  let words = await getWords();
  if (dueOnly) words = words.filter(isDue);
  if (!words.length) throw new Error("No words available");
  const w = words[Math.floor(Math.random() * words.length)];
  currentQuiz = makeQuiz(w, mode);
  $("quizHint").textContent = currentQuiz.hint;
  $("quizQuestion").textContent = currentQuiz.question;
  $("answerBox").classList.add("hidden");
  $("quizAnswer").textContent = currentQuiz.answer;
  $("quizExample").innerHTML = `${escapeHtml(currentQuiz.example_jp)}<br>${escapeHtml(currentQuiz.example_en)}`;
  renderCurrentWord(currentQuiz.word);
}

async function startSpecificQuiz(key) {
  const words = await getWords();
  const w = words.find(x => wordKey(x) === key);
  if (!w) return toast("Word not found");
  setView("study");
  currentQuiz = makeQuiz(w, $("quizMode").value);
  $("quizHint").textContent = currentQuiz.hint;
  $("quizQuestion").textContent = currentQuiz.question;
  $("answerBox").classList.add("hidden");
  $("quizAnswer").textContent = currentQuiz.answer;
  $("quizExample").innerHTML = `${escapeHtml(currentQuiz.example_jp)}<br>${escapeHtml(currentQuiz.example_en)}`;
  renderCurrentWord(currentQuiz.word);
}

function updateLocalReview(key, result, mode) {
  const reviews = getReviews();
  const prev = reviews[key] || { review_count: 0, correct_count: 0, wrong_count: 0 };
  const correct = result === "good" || result === "easy";
  reviews[key] = {
    ...prev,
    status: result,
    mode,
    review_count: (prev.review_count || 0) + 1,
    correct_count: (prev.correct_count || 0) + (correct ? 1 : 0),
    wrong_count: (prev.wrong_count || 0) + (correct ? 0 : 1),
    last_reviewed_at: new Date().toISOString(),
    next_review_at: nextReviewDate(result),
  };
  saveReviews(reviews);
}

async function reviewCurrent(result) {
  if (!currentQuiz) {
    toast("No active quiz");
    return;
  }
  updateLocalReview(wordKey(currentQuiz.word), result, currentQuiz.mode);
  toast(`Saved locally: ${result}`);
  cachedWords = cachedWords.map(w => wordKey(w) === wordKey(currentQuiz.word) ? mergeReview(w) : w);
  await loadStats();
  await newQuiz();
}

async function loadPacks() {
  const packs = await api("/api/packs");
  const el = $("packList");
  el.innerHTML = packs.length ? "" : `<p class="muted">No packs found in data/packs.</p>`;
  packs.forEach(p => {
    const div = document.createElement("article");
    div.className = "pack-row";
    div.innerHTML = `
      <div>
        <b>${escapeHtml(p.name)}</b>
        <div class="meta">${p.count} words</div>
      </div>
      <span class="tag">Server pack</span>
    `;
    el.appendChild(div);
  });
}

async function exportJson() {
  const words = await getWords();
  const data = { words, reviews: getReviews(), hidden_words: getHiddenWords(), exported_at: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "wapilot0001_local_export.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

document.querySelectorAll(".nav-btn").forEach(btn => btn.addEventListener("click", () => setView(btn.dataset.target)));
$("refreshBtn").addEventListener("click", loadStats);
$("loadDueBtn").addEventListener("click", loadDue);
$("searchBtn").addEventListener("click", loadWords);
$("newQuizBtn").addEventListener("click", () => newQuiz().catch(e => toast(e.message)));
$("showAnswerBtn").addEventListener("click", () => $("answerBox").classList.toggle("hidden"));
$("speakQuestionBtn").addEventListener("click", () => {
  if (currentQuiz) speak(currentQuiz.word.japanese);
});
$("speakExampleBtn")?.addEventListener("click", () => {
  if (currentQuiz) speak(currentQuiz.example_jp);
});
document.querySelectorAll(".review-btn[data-result]").forEach(btn => btn.addEventListener("click", () => reviewCurrent(btn.dataset.result)));
$("exportBtn").addEventListener("click", exportJson);

["searchInput", "levelFilter", "partFilter", "tagFilter", "statusFilter"].forEach(id => {
  $(id).addEventListener("keydown", e => { if (e.key === "Enter") loadWords(); });
  $(id).addEventListener("change", loadWords);
});

loadStats().catch(e => toast(e.message));
