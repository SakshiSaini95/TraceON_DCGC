const express = require("express");
const crypto = require("crypto");
const net = require("net");
const db = require("../database/db");

const router = express.Router();

const CATEGORIES = new Set([
    "phishing",
    "fake_store",
    "payment_fraud",
    "impersonation",
    "malware"
]);

const SHORTENERS = new Set([
    "bit.ly", "tinyurl.com", "t.co",
    "cutt.ly", "rb.gy", "shorturl.at", "is.gd"
]);

function getDomain(value) {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("Only HTTP and HTTPS URLs are supported.");
    }
    return url.hostname.toLowerCase();
}

// URL analysis
router.post("/analyze", (req, res) => {
    try {
        const rawUrl = typeof req.body?.url === "string"
            ? req.body.url.trim() : "";

        if (!rawUrl || rawUrl.length > 2048) {
            return res.status(400).json({
                success: false,
                message: "Valid URL required."
            });
        }

        let parsed;
        try {
            parsed = new URL(rawUrl);
        } catch {
            return res.status(400).json({
                success: false,
                message: "Invalid URL."
            });
        }

        if (!["http:", "https:"].includes(parsed.protocol)) {
            return res.status(400).json({
                success: false,
                message: "Unsupported URL protocol."
            });
        }

        const domain = parsed.hostname.toLowerCase();
        let score = 0;
        const reasons = [];

        function flag(points, reason) {
            score += points;
            reasons.push(reason);
        }

        if (parsed.username || parsed.password)
            flag(60, "URL contains embedded login credentials.");

        if (net.isIP(domain))
            flag(40, "Website uses a direct IP address.");

        if (domain.includes("xn--"))
            flag(45, "Domain uses encoded international characters.");

        if (SHORTENERS.has(domain))
            flag(25, "Link shortener hides the final destination.");

        if (parsed.protocol === "http:")
            flag(20, "Website does not use HTTPS.");

        if (/verify-account|secure-login|claim-prize|free-gift|wallet-connect/i.test(domain))
            flag(25, "Suspicious wording detected in domain.");

        score = Math.min(score, 100);

        const riskLevel = score >= 60
            ? "high" : score >= 25 ? "medium" : "low";

        const community = db.prepare(`
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN verification_status = 'verified'
                    THEN 1 ELSE 0 END) AS verified,
                SUM(CASE WHEN verification_status = 'unverified'
                    THEN 1 ELSE 0 END) AS unverified
            FROM link_reports WHERE domain = ?
        `).get(domain);

        return res.json({
            success: true,
            domain,
            score,
            riskLevel,
            reasons,
            communityReports: {
                total: community.total || 0,
                verified: community.verified || 0,
                unverified: community.unverified || 0
            },
            status: "heuristic_scan",
            summary: reasons.length
                ? "Suspicious URL patterns detected. Review before proceeding."
                : "No obvious suspicious patterns detected. Safety is not guaranteed."
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Analysis failed."
        });
    }
});

// Submit a community report
router.post("/reports", (req, res) => {
    try {
        const { url, category, description, reporter_key } = req.body;

        if (typeof url !== "string" || !CATEGORIES.has(category)) {
            return res.status(400).json({
                success: false,
                message: "Valid URL and report category required."
            });
        }

        let domain;
        try {
            domain = getDomain(url.trim());
        } catch {
            return res.status(400).json({
                success: false,
                message: "Invalid website URL."
            });
        }

        if (typeof description !== "string" || description.trim().length < 5 || description.length > 1000) {
            return res.status(400).json({
                success: false,
                message: "Description must contain 5–1000 characters."
            });
        }

        const key = typeof reporter_key === "string" &&
            /^[a-zA-Z0-9-]{8,128}$/.test(reporter_key)
            ? reporter_key : null;

        const result = db.prepare(`
            INSERT OR IGNORE INTO link_reports
            (domain, category, description, reporter_key)
            VALUES (?, ?, ?, ?)
        `).run(domain, category, description.trim(), key);

        if (!result.changes) {
            return res.status(409).json({
                success: false,
                message: "You have already reported this domain."
            });
        }

        return res.status(201).json({
            success: true,
            message: "Report submitted for review.",
            reportId: result.lastInsertRowid,
            verificationStatus: "unverified"
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Could not submit report."
        });
    }
});

// Get community reports for a domain
router.get("/reports", (req, res) => {
    try {
        const domain = getDomain(req.query.url || "");

        const summary = db.prepare(`
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN verification_status = 'verified'
                    THEN 1 ELSE 0 END) AS verified,
                SUM(CASE WHEN verification_status = 'unverified'
                    THEN 1 ELSE 0 END) AS unverified
            FROM link_reports WHERE domain = ?
        `).get(domain);

        const categories = db.prepare(`
            SELECT category, COUNT(*) AS count
            FROM link_reports
            WHERE domain = ?
            GROUP BY category
        `).all(domain);

        return res.json({
            success: true,
            domain,
            summary,
            categories
        });

    } catch {
        return res.status(400).json({
            success: false,
            message: "Valid URL query parameter required."
        });
    }
});

module.exports = router;

