const API = "http://localhost:5000/api";

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  const input = $("sellerInput");
  const checkBtn = $("checkBtn");
  const message = $("message");
  const result = $("result");

  if (!input || !checkBtn || !result) {
    console.error("TRACEON: Required popup elements are missing.");
    return;
  }

  function showMessage(text, isError = false) {
    message.textContent = text;
    message.classList.remove("hidden");
    message.style.color = isError ? "#ff7777" : "#4be08a";
  }

  function hideMessage() {
    message.textContent = "";
    message.classList.add("hidden");
  }

  async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || `Request failed (${response.status})`);
    }

    return data;
  }

  function addSignal(signal) {
    const item = document.createElement("div");
    item.style.cssText =
      "padding:10px;margin:8px 0;border:1px solid #343b32;border-radius:8px;background:#171b17;";

    const name = document.createElement("strong");
    name.textContent = signal.name || signal.type || "Risk signal";
    name.style.display = "block";
    name.style.color = "#f0f0e8";

    const explanation = document.createElement("p");
    explanation.textContent = signal.explanation || "Verified signal recorded.";
    explanation.style.cssText = "margin:5px 0;color:#aaa;font-size:12px;";

    const details = document.createElement("small");
    details.textContent =
      `${String(signal.severity || "unknown").toUpperCase()} SEVERITY · ${signal.points ?? 0} POINTS · ${(signal.evidence || []).length} EVIDENCE`;
    details.style.color = "#d4ff00";

    item.append(name, explanation, details);
    $("signalsList").appendChild(item);
  }

  function renderReportForm(seller) {
    const oldPanel = $("reportPanel");
    if (oldPanel) oldPanel.remove();

    const panel = document.createElement("section");
    panel.id = "reportPanel";
    panel.style.cssText =
      "margin-top:16px;padding:12px;border:1px solid #414936;border-radius:10px;background:#171b17;";

    const heading = document.createElement("h3");
    heading.textContent = "REPORT THIS SELLER";
    heading.style.cssText = "color:#d4ff00;font-size:13px;margin:0 0 10px;";

    const reason = document.createElement("select");
    reason.style.cssText =
      "width:100%;padding:10px;background:#242a22;color:white;border:1px solid #555;border-radius:6px;margin-bottom:9px;";
    reason.innerHTML = `
      <option value="">Select a reason</option>
      <option value="suspected_fraud">Suspected fraud</option>
      <option value="fake_identity">Fake identity</option>
      <option value="payment_issue">Payment issue</option>
      <option value="non_delivery">Product not delivered</option>
      <option value="other">Other</option>
    `;

    const description = document.createElement("textarea");
    description.placeholder = "Add details (optional)";
    description.rows = 3;
    description.maxLength = 2000;
    description.style.cssText =
      "box-sizing:border-box;width:100%;padding:10px;background:#242a22;color:white;border:1px solid #555;border-radius:6px;resize:vertical;margin-bottom:9px;";

    const submit = document.createElement("button");
    submit.textContent = "SUBMIT REPORT";
    submit.style.cssText =
      "width:100%;padding:11px;background:#d4ff00;color:#111;border:0;border-radius:6px;font-weight:bold;cursor:pointer;";

    const feedback = document.createElement("p");
    feedback.style.cssText = "font-size:12px;margin:9px 0 0;color:#aaa;";

    submit.addEventListener("click", async () => {
      if (!reason.value) {
        feedback.textContent = "Please select a report reason.";
        feedback.style.color = "#ffb020";
        return;
      }

      submit.disabled = true;
      submit.textContent = "SUBMITTING...";

      try {
        await apiRequest(`${API}/reports`, {
          method: "POST",
          body: JSON.stringify({
            seller_id: seller.id,
            reason: reason.value,
            description: description.value.trim()
          })
        });

        feedback.textContent = "Report submitted successfully. Thank you for helping the community.";
        feedback.style.color = "#4be08a";
        reason.disabled = true;
        description.disabled = true;
        submit.textContent = "REPORT SUBMITTED";
      } catch (error) {
        feedback.textContent = error.message;
        feedback.style.color = "#ff7777";
        submit.disabled = false;
        submit.textContent = "SUBMIT REPORT";
      }
    });

    panel.append(heading, reason, description, submit, feedback);
    result.appendChild(panel);
  }

  function renderAnalysis(seller, analysis) {
    result.classList.remove("hidden");

    $("sellerName").textContent = seller.username
      ? `@${seller.username.replace(/^@/, "")}`
      : "Seller profile";

    $("sellerPlatform").textContent =
      `${seller.platform || "Seller"}${seller.profile_url ? " · " + seller.profile_url : ""}`;

    const badge = $("riskBadge");
    const ring = $("scoreRing");
    const signalsList = $("signalsList");

    signalsList.replaceChildren();

    if (analysis.status === "insufficient_evidence") {
      badge.textContent = "INSUFFICIENT DATA";
      badge.className = "badge unknown";

      $("riskScore").textContent = "--";
      $("riskTitle").textContent = "Not enough verified evidence";
      $("riskSummary").textContent =
        analysis.summary || "There is not enough verified evidence to calculate a risk score.";

      ring.style.setProperty("--tone", "#929292");
      ring.style.setProperty("--pct", "0%");
    } else {
      const level = analysis.riskLevel || "unknown";
      const score = Number(analysis.score);

      badge.textContent = level.toUpperCase() + " RISK";
      badge.className = `badge ${level}`;

      $("riskScore").textContent = Number.isFinite(score) ? score : "--";
      $("riskTitle").textContent =
        level.charAt(0).toUpperCase() + level.slice(1) + " risk detected";

      $("riskSummary").textContent =
        analysis.summary || "Review the verified signals before deciding.";

      const tones = {
        low: "#4be08a",
        medium: "#ffb020",
        high: "#ff5a4d"
      };

      ring.style.setProperty("--tone", tones[level] || "#929292");
      ring.style.setProperty("--pct", `${Math.max(0, Math.min(100, score || 0))}%`);
    }

    $("verifiedCount").textContent = analysis.verifiedEvidenceCount ?? 0;
    $("pendingCount").textContent = analysis.unverifiedEvidenceCount ?? 0;

    const confidence = analysis.evidenceConfidence?.level || "unknown";
    $("confidence").textContent = confidence.toUpperCase();

    if (Array.isArray(analysis.signals) && analysis.signals.length) {
      analysis.signals.forEach(addSignal);
    } else {
      const empty = document.createElement("p");
      empty.textContent = "No verified risk signals recorded.";
      signalsList.appendChild(empty);
    }

    renderReportForm(seller);
  }

  async function checkSeller() {
    const query = input.value.trim();

    if (!query) {
      showMessage("Enter a username, phone number, or profile URL.", true);
      input.focus();
      return;
    }

    checkBtn.disabled = true;
    checkBtn.textContent = "SCANNING...";
    result.classList.add("hidden");
    hideMessage();

    try {
      const lookupUrl = `${API}/sellers/lookup?query=${encodeURIComponent(query)}`;
      const lookup = await apiRequest(lookupUrl);

      if (!lookup.found || !lookup.seller) {
        throw new Error("Seller was not found in the TRACEON database.");
      }

      const seller = lookup.seller;

      const riskData = await apiRequest(
        `${API}/sellers/${encodeURIComponent(seller.id)}/risk-analysis`
      );

      if (!riskData.analysis) {
        throw new Error("Risk analysis was not returned by the server.");
      }

      renderAnalysis(seller, riskData.analysis);
      showMessage("Scan complete. Review the report before making a decision.");
    } catch (error) {
      result.classList.add("hidden");
      showMessage(error.message || "Could not connect to TRACEON backend.", true);
      console.error("TRACEON scan error:", error);
    } finally {
      checkBtn.disabled = false;
      checkBtn.innerHTML = 'INITIATE SCAN <span>?</span>';
    }
  }

  checkBtn.addEventListener("click", checkSeller);

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") checkSeller();
  });
});
