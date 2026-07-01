(() => {
  "use strict";

  const CIRCUMFERENCE = 2 * Math.PI * 88; // matches r=88 in the SVG seal

  const el = (id) => document.getElementById(id);

  const form          = el("calcForm");
  const errorLine     = el("errorLine");
  const resultEmpty   = el("resultEmpty");
  const resultFull    = el("resultFull");
  const sealProgress  = el("sealProgress");
  const sealPct       = el("sealPct");
  const statusLabel   = el("statusLabel");
  const statusRange   = el("statusRange");
  const tallyAttended = el("tallyAttended");
  const tallyMissed   = el("tallyMissed");
  const tallyTotal    = el("tallyTotal");
  const advisory      = el("advisory");
  const historyBody   = el("historyBody");
  const clearBtn      = el("clearHistoryBtn");
  const statCount     = el("statCount");
  const statAverage   = el("statAverage");
  const statBest      = el("statBest");

  // ---- Init: set up seal stroke dasharray precisely ----
  sealProgress.style.strokeDasharray = String(CIRCUMFERENCE);
  sealProgress.style.strokeDashoffset = String(CIRCUMFERENCE);

  function fmtDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
        " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    } catch { return iso; }
  }

  function statusClassFromLabel(label) {
    switch (label) {
      case "SHORT": return "risk";
      case "SATISFACTORY": return "satisfactory";
      case "GOOD": return "good";
      case "EXCELLENT": return "excellent";
      default: return "risk";
    }
  }

  function renderResult(data) {
    resultEmpty.classList.add("hidden");
    resultFull.classList.remove("hidden");

    const pct = Math.max(0, Math.min(100, data.percentage));
    const offset = CIRCUMFERENCE * (1 - pct / 100);

    // reset then animate on next frame so the transition always fires
    sealProgress.style.transition = "none";
    sealProgress.style.strokeDashoffset = String(CIRCUMFERENCE);
    sealProgress.classList.remove("risk", "satisfactory", "good", "excellent");
    void sealProgress.getBoundingClientRect(); // force reflow
    requestAnimationFrame(() => {
      sealProgress.style.transition = "";
      sealProgress.style.strokeDashoffset = String(offset);
      sealProgress.classList.add(data.status_class);
    });

    animateNumber(sealPct, data.percentage);

    statusLabel.textContent = data.status;
    statusLabel.className = "status-label " + data.status_class;
    statusRange.textContent = data.status_range;

    tallyAttended.textContent = data.attended;
    tallyMissed.textContent = data.missed;
    tallyTotal.textContent = data.total_classes;

    if (data.status === "SHORT") {
      advisory.textContent = data.classes_needed_for_75 > 0
        ? `Attend the next ${data.classes_needed_for_75} class${data.classes_needed_for_75 === 1 ? "" : "es"} in a row to reach 75%.`
        : `You're right at the edge — don't miss the next one.`;
    } else {
      advisory.textContent = data.classes_can_skip_for_75 > 0
        ? `You can miss up to ${data.classes_can_skip_for_75} more class${data.classes_can_skip_for_75 === 1 ? "" : "es"} and stay at or above 75%.`
        : `You're exactly on the 75% line — attend the next one to be safe.`;
    }
  }

  function animateNumber(node, target) {
    const start = 0;
    const duration = 700;
    const t0 = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = (start + (target - start) * eased);
      node.textContent = val.toFixed(target % 1 === 0 ? 0 : 1);
      if (p < 1) requestAnimationFrame(tick);
      else node.textContent = String(target);
    }
    requestAnimationFrame(tick);
  }

  function badgeClassFromStatus(status) {
    return statusClassFromLabel(status);
  }

  function renderHistoryRow(rec) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${rec.id}</td>
      <td>${escapeHtml(rec.subject)}</td>
      <td>${rec.attended} / ${rec.total_classes}</td>
      <td>${rec.percentage}%</td>
      <td><span class="badge ${badgeClassFromStatus(rec.status)}">${rec.status}</span></td>
      <td>${fmtDate(rec.created_at)}</td>
      <td><button class="row-delete" data-id="${rec.id}" title="Delete entry" aria-label="Delete entry">✕</button></td>
    `;
    return tr;
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  async function loadHistory() {
    try {
      const res = await fetch("/api/history");
      const rows = await res.json();
      historyBody.innerHTML = "";
      if (!rows.length) {
        historyBody.innerHTML = `<tr class="empty-row"><td colspan="7">No entries yet — your first calculation will appear here.</td></tr>`;
      } else {
        rows.forEach((rec) => historyBody.appendChild(renderHistoryRow(rec)));
      }
    } catch (e) {
      console.error("Failed to load history", e);
    }
  }

  async function loadStats() {
    try {
      const res = await fetch("/api/stats");
      const s = await res.json();
      statCount.textContent = s.count ?? 0;
      statAverage.textContent = s.count ? `${s.average}%` : "—";
      if (s.count) {
        const dist = s.distribution || {};
        const best = ["EXCELLENT", "GOOD", "SATISFACTORY", "SHORT"].find((k) => dist[k]) || "—";
        statBest.textContent = best;
      } else {
        statBest.textContent = "—";
      }
    } catch (e) {
      console.error("Failed to load stats", e);
    }
  }

  form.addEventListener("submit", async (evt) => {
    evt.preventDefault();
    errorLine.textContent = "";

    const subject  = el("subject").value;
    const total    = el("total").value;
    const attended = el("attended").value;

    if (total === "" || attended === "") {
      errorLine.textContent = "Please fill in both class counts.";
      return;
    }

    const submitBtn = form.querySelector(".btn-primary");
    submitBtn.disabled = true;

    try {
      const res = await fetch("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, total_classes: total, attended: attended }),
      });
      const data = await res.json();

      if (!res.ok) {
        errorLine.textContent = data.error || "Something went wrong.";
        return;
      }

      renderResult(data);
      await Promise.all([loadHistory(), loadStats()]);
    } catch (e) {
      errorLine.textContent = "Could not reach the server. Please try again.";
      console.error(e);
    } finally {
      submitBtn.disabled = false;
    }
  });

  historyBody.addEventListener("click", async (evt) => {
    const btn = evt.target.closest(".row-delete");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    try {
      await fetch(`/api/history/${id}`, { method: "DELETE" });
      await Promise.all([loadHistory(), loadStats()]);
    } catch (e) {
      console.error("Failed to delete entry", e);
    }
  });

  clearBtn.addEventListener("click", async () => {
    if (!confirm("Clear the entire history? This can't be undone.")) return;
    try {
      await fetch("/api/history", { method: "DELETE" });
      await Promise.all([loadHistory(), loadStats()]);
    } catch (e) {
      console.error("Failed to clear history", e);
    }
  });

  // Initial load
  loadHistory();
  loadStats();
})();
