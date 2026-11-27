(() => {
    if (window.__TRACEON_GUARD__) return;
    window.__TRACEON_GUARD__ = true;

    const API = "http://localhost:5000/api/links";
    let scanning = false;

    function escapeText(value) {
        return String(value).replace(/[&<>"']/g, c => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;",
            '"': "&quot;", "'": "&#39;"
        })[c]);
    }

    function getDestination(anchor) {
        try {
            let url = new URL(anchor.href);

            if (url.hostname === "l.instagram.com" && url.searchParams.has("u")) {
                url = new URL(url.searchParams.get("u"));
            }

            if (!["http:", "https:"].includes(url.protocol)) return null;

            if (
                url.hostname === "instagram.com" ||
                url.hostname.endsWith(".instagram.com")
            ) return null;

            return url.href;
        } catch {
            return null;
        }
    }

    function getReporterKey() {
        return new Promise(resolve => {
            if (!chrome?.storage?.local) {
                resolve(crypto.randomUUID());
                return;
            }

            chrome.storage.local.get(["traceonReporterKey"], result => {
                if (result.traceonReporterKey) {
                    resolve(result.traceonReporterKey);
                } else {
                    const key = crypto.randomUUID();
                    chrome.storage.local.set({ traceonReporterKey: key });
                    resolve(key);
                }
            });
        });
    }

    function showReport(url, result, pendingTab, newTab) {
        const domain = new URL(url).hostname;
        const host = document.createElement("div");

        host.style.cssText = "position:fixed;inset:0;z-index:2147483647;";
        document.documentElement.appendChild(host);

        const shadow = host.attachShadow({ mode: "open" });

        shadow.innerHTML = `
        <style>
            * {box-sizing:border-box}
            .overlay {
                position:fixed;inset:0;background:rgba(0,0,0,.88);
                display:flex;align-items:center;justify-content:center;
                padding:16px;font-family:Arial,sans-serif;color:#f1f2e9;
                overflow-y:auto;
            }
            .panel {
                width:100%;max-width:460px;background:#151714;
                border:1px solid #42483a;padding:25px;
                box-shadow:0 20px 80px #000;max-height:94vh;overflow-y:auto;
            }
            .brand {color:#d4ff00;font-size:13px;font-weight:900;letter-spacing:3px}
            .tag {color:#858b7b;font-size:10px;letter-spacing:2px;margin-top:8px}
            h2 {font-size:24px;margin:17px 0 7px}
            .domain {
                padding:12px;background:#20231c;border:1px solid #353b2d;
                overflow-wrap:anywhere;color:#d4ff00;font-size:13px;
            }
            .scorearea {display:flex;align-items:center;gap:17px;margin:20px 0}
            .number {font-size:43px;font-weight:900}
            .outof {font-size:12px;color:#8e9486}
            .risk {font-size:13px;font-weight:900;letter-spacing:1px}
            .meter {height:7px;background:#30342b;margin-top:10px}
            .fill {height:100%;transition:width .3s}
            .section {font-size:10px;color:#d4ff00;letter-spacing:2px;margin:22px 0 10px;font-weight:bold}
            .item {
                padding:10px 0;border-bottom:1px solid #30342b;
                font-size:12px;color:#c3c7bb;line-height:1.5;
            }
            .status {float:right;font-size:10px;font-weight:bold}
            .good {color:#65e99b}.warn {color:#ffbd59}.bad {color:#ff655c}
            .muted {color:#92988b;font-size:11px;line-height:1.6}
            .stats {display:flex;gap:8px;margin-top:10px}
            .stat {flex:1;padding:12px;background:#20231c;text-align:center}
            .stat strong {display:block;font-size:20px;color:#d4ff00}
            .stat span {font-size:9px;color:#a2a697}
            button {
                width:100%;padding:13px;margin-top:9px;border:0;
                font-weight:900;letter-spacing:1px;cursor:pointer;
            }
            .back {background:#d4ff00;color:#111}
            .continue {background:#252920;color:#eee;border:1px solid #41483a}
            .report {background:transparent;color:#d4ff00;border:1px solid #68713d}
            select,textarea {
                width:100%;padding:12px;margin-top:9px;
                background:#20231c;color:white;border:1px solid #42483a;
                font:12px Arial;
            }
            textarea {min-height:80px;resize:vertical}
            .hidden {display:none}
            .message {font-size:12px;margin-top:10px;line-height:1.5}
            .disclaimer {font-size:10px;color:#858b7b;line-height:1.6;margin-top:17px}
            button:disabled {opacity:.5;cursor:wait}
        </style>

        <div class="overlay">
          <div class="panel">
            <div class="brand">TRACEON / LINK INTELLIGENCE</div>
            <div class="tag">PRE-CLICK SECURITY ANALYSIS</div>

            <h2>PAUSE BEFORE YOU PROCEED.</h2>
            <p class="muted">External destination detected.</p>
            <div class="domain" id="domain"></div>

            <div class="scorearea">
                <div>
                    <div class="number" id="score">--</div>
                    <div class="outof">RISK SCORE / 100</div>
                </div>
                <div>
                    <div class="risk" id="risk">SCANNING</div>
                    <div class="muted" id="summary">Checking URL patterns...</div>
                </div>
            </div>

            <div class="meter"><div class="fill" id="fill"></div></div>

            <div class="section">SECURITY CHECKS</div>
            <div id="checks"></div>

            <div class="section">COMMUNITY INTELLIGENCE</div>
            <div class="stats">
                <div class="stat"><strong id="total">0</strong><span>TOTAL REPORTS</span></div>
                <div class="stat"><strong id="verified">0</strong><span>VERIFIED</span></div>
                <div class="stat"><strong id="unverified">0</strong><span>UNVERIFIED</span></div>
            </div>

            <p class="muted" style="margin-top:9px">
                Community reports are user-submitted and do not automatically prove fraud.
            </p>

            <button class="back" id="back">GO BACK</button>
            <button class="continue" id="continue">CONTINUE ANYWAY</button>
            <button class="report" id="report">+ REPORT THIS LINK</button>

            <div id="reportForm" class="hidden">
                <div class="section">SUBMIT COMMUNITY REPORT</div>
                <select id="category">
                    <option value="phishing">Phishing / Fake login</option>
                    <option value="fake_store">Fake online store</option>
                    <option value="payment_fraud">Payment fraud</option>
                    <option value="impersonation">Brand / Seller impersonation</option>
                    <option value="malware">Malware / Harmful download</option>
                </select>
                <textarea id="description" maxlength="1000"
                    placeholder="Describe why you think this link is suspicious (minimum 5 characters)..."></textarea>
                <button class="back" id="submitReport">SUBMIT REPORT</button>
                <button class="continue" id="cancelReport">CANCEL</button>
                <div class="message" id="reportMessage"></div>
            </div>

            <div class="disclaimer">
                TRACEON uses heuristic URL analysis. It does not inspect the full website
                or guarantee safety. A low score is not proof that a website is trustworthy.
            </div>
          </div>
        </div>`;

        const $ = id => shadow.getElementById(id);

        $("domain").textContent = domain;

        function addCheck(label, value, type) {
            const item = document.createElement("div");
            item.className = "item";

            const name = document.createElement("span");
            name.textContent = label;

            const status = document.createElement("span");
            status.className = "status " + type;
            status.textContent = value;

            item.append(name, status);
            $("checks").appendChild(item);
        }

        const https = new URL(url).protocol === "https:";
        addCheck("HTTPS encryption", https ? "SECURE CONNECTION" : "NOT SECURE",
            https ? "good" : "warn");

        const shortened = [
            "bit.ly", "tinyurl.com", "t.co", "cutt.ly",
            "rb.gy", "shorturl.at", "is.gd"
        ].includes(domain);

        addCheck("Link destination", shortened ? "SHORTENED URL" : "DIRECT URL",
            shortened ? "warn" : "good");

        if (result) {
            $("score").textContent = result.score;
            $("risk").textContent = result.riskLevel.toUpperCase() + " RISK";
            $("risk").style.color = result.riskLevel === "high"
                ? "#ff655c" : result.riskLevel === "medium"
                    ? "#ffbd59" : "#65e99b";

            $("summary").textContent = result.summary;
            $("fill").style.width = result.score + "%";
            $("fill").style.background = result.riskLevel === "high"
                ? "#ff655c" : result.riskLevel === "medium"
                    ? "#ffbd59" : "#65e99b";

            if (result.reasons?.length) {
                result.reasons.forEach(reason =>
                    addCheck(reason, "DETECTED", "bad")
                );
            } else {
                addCheck("Known suspicious URL patterns", "NOT DETECTED", "good");
            }

            const community = result.communityReports || {};
            $("total").textContent = community.total || 0;
            $("verified").textContent = community.verified || 0;
            $("unverified").textContent = community.unverified || 0;
        } else {
            $("score").textContent = "N/A";
            $("risk").textContent = "SCAN UNAVAILABLE";
            $("risk").style.color = "#ffbd59";
            $("summary").textContent = "Could not connect to TRACEON.";
            $("fill").style.width = "0%";
            addCheck("URL analysis", "UNAVAILABLE", "warn");
        }

        function closeWarning() {
            host.remove();
        }

        $("back").addEventListener("click", () => {
            if (pendingTab && !pendingTab.closed) pendingTab.close();
            closeWarning();
        });

        $("continue").addEventListener("click", () => {
            if (newTab && pendingTab && !pendingTab.closed) {
                pendingTab.location.href = url;
            } else {
                window.location.assign(url);
            }
            closeWarning();
        });

        $("report").addEventListener("click", () => {
            $("reportForm").classList.toggle("hidden");
            $("reportMessage").textContent = "";
        });

        $("cancelReport").addEventListener("click", () => {
            $("reportForm").classList.add("hidden");
        });

        $("submitReport").addEventListener("click", async () => {
            const description = $("description").value.trim();
            const category = $("category").value;
            const button = $("submitReport");
            const message = $("reportMessage");

            if (description.length < 5) {
                message.textContent = "Please enter at least 5 characters.";
                message.style.color = "#ffbd59";
                return;
            }

            button.disabled = true;
            button.textContent = "SUBMITTING...";
            message.textContent = "";

            try {
                const reporterKey = await getReporterKey();

                const response = await fetch(API + "/reports", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        url,
                        category,
                        description,
                        reporter_key: reporterKey
                    })
                });

                const data = await response.json();

                if (!response.ok) throw new Error(data.message || "Submission failed.");

                message.textContent = "✓ Report submitted for review. Thank you!";
                message.style.color = "#65e99b";
                $("description").value = "";

                const updated = await fetch(API + "/analyze", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url })
                });

                if (updated.ok) {
                    const refreshed = await updated.json();
                    $("total").textContent = refreshed.communityReports.total;
                    $("verified").textContent = refreshed.communityReports.verified;
                    $("unverified").textContent = refreshed.communityReports.unverified;
                }
            } catch (error) {
                message.textContent = error.message;
                message.style.color = "#ff655c";
            } finally {
                button.disabled = false;
                button.textContent = "SUBMIT REPORT";
            }
        });
    }

    document.addEventListener("click", async event => {
        if (scanning || event.defaultPrevented) return;

        const anchor = event.target?.closest?.("a[href]");
        if (!anchor) return;

        const destination = getDestination(anchor);
        if (!destination) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        scanning = true;

        const newTab = anchor.target === "_blank" ||
            event.ctrlKey || event.metaKey;
        let pendingTab = null;

        if (newTab) pendingTab = window.open("about:blank", "_blank");

        try {
            const response = await fetch(API + "/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: destination })
            });

            if (!response.ok) throw new Error("Scan failed");

            const result = await response.json();

            showReport(destination, result, pendingTab, newTab);
        } catch (error) {
            showReport(destination, null, pendingTab, newTab);
        } finally {
            scanning = false;
        }
    }, true);

    console.log("TRACEON Link Intelligence activated.");
})();
