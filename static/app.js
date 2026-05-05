let currentQuiz = null;

const $ = (id) => document.getElementById(id);

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
  const s = await api("/api/stats");
  $("statTotal").textContent = s.total;
  $("statDue").textContent = s.due;
  $("statLearned").textContent = s.learned;
  $("statAccuracy").textContent = `${s.accuracy}%`;
}

async function loadDue() {
  const data = await api("/api/due?limit=24");
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
      <button class="ghost-btn" onclick="speak('${escapeHtml(w.japanese)}')">🔊</button>
      <button class="secondary-btn" onclick="startSpecificQuiz(${w.id})">Study</button>
    </div>
  `;
  return div;
}

async function loadWords() {
  const params = new URLSearchParams({
    q: $("searchInput").value,
    level: $("levelFilter").value,
    part: $("partFilter").value,
    tag: $("tagFilter").value,
    status: $("statusFilter").value,
    limit: "1000",
  });
  const data = await api(`/api/words?${params}`);
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
        <button class="review-btn good" data-review="${w.id}" data-result="good">Good</button>
        <button class="review-btn danger" data-delete="${w.id}">Delete</button>
      </div>
    `;
    el.appendChild(div);
  });

  el.querySelectorAll("[data-speak]").forEach(btn => btn.addEventListener("click", () => speak(btn.dataset.speak)));
  el.querySelectorAll("[data-delete]").forEach(btn => btn.addEventListener("click", async () => {
    if (!confirm("Delete this word?")) return;
    await api(`/api/words/${btn.dataset.delete}`, { method: "DELETE" });
    toast("Deleted");
    loadWords();
    loadStats();
  }));
  el.querySelectorAll("[data-review]").forEach(btn => btn.addEventListener("click", async () => {
    await api(`/api/words/${btn.dataset.review}/review`, {
      method: "PATCH",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ result: btn.dataset.result, mode: "manual" })
    });
    toast("Review updated");
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
    <p><b>Example JP:</b><br>${escapeHtml(w.example_jp)}</p>
    <p><b>Example EN:</b><br>${escapeHtml(w.example_en)}</p>
    <div class="tags">${(w.tags_list || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>
  `;
}

async function newQuiz() {
  const mode = $("quizMode").value;
  const dueOnly = $("dueOnlyQuiz").checked;
  currentQuiz = await api(`/api/quiz?mode=${encodeURIComponent(mode)}&due_only=${dueOnly}`);
  $("quizHint").textContent = currentQuiz.hint;
  $("quizQuestion").textContent = currentQuiz.question;
  $("answerBox").classList.add("hidden");
  $("quizAnswer").textContent = currentQuiz.answer;
  $("quizExample").innerHTML = `${escapeHtml(currentQuiz.example_jp)}<br>${escapeHtml(currentQuiz.example_en)}`;
  renderCurrentWord(currentQuiz.word);
}

async function reviewCurrent(result) {
  if (!currentQuiz) {
    toast("No active quiz");
    return;
  }
  await api(`/api/words/${currentQuiz.word.id}/review`, {
    method: "PATCH",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ result, mode: currentQuiz.mode }),
  });
  toast(`Marked: ${result}`);
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
      <button class="primary-btn" data-import="${escapeHtml(p.name)}">Import</button>
    `;
    el.appendChild(div);
  });
  el.querySelectorAll("[data-import]").forEach(btn => btn.addEventListener("click", async () => {
    const result = await api(`/api/import/${btn.dataset.import}`, { method: "POST" });
    toast(`Imported ${result.imported}, skipped ${result.skipped}`);
    loadStats();
  }));
}

async function exportJson() {
  const data = await api("/api/export");
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "jppilot0002_export.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

async function addManual(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const payload = Object.fromEntries(fd.entries());
  payload.difficulty = Number(payload.difficulty || 3);
  payload.tags = String(payload.tags || "").split(",").map(x => x.trim()).filter(Boolean);
  await api("/api/words", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(payload),
  });
  toast("Word added");
  e.target.reset();
  e.target.jlpt_level.value = "N2";
  e.target.difficulty.value = 3;
  loadStats();
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
$("manualForm").addEventListener("submit", addManual);

["searchInput", "levelFilter", "partFilter", "tagFilter", "statusFilter"].forEach(id => {
  $(id).addEventListener("keydown", e => { if (e.key === "Enter") loadWords(); });
  $(id).addEventListener("change", loadWords);
});

loadStats();
