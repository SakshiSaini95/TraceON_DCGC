const crypto = require("crypto");

function requireEvidenceAdmin(req, res, next) {
    const expectedKey = process.env.TRACEON_EVIDENCE_ADMIN_KEY;
    if (!expectedKey) {
        return res.status(503).json({
            success: false,
            message: "Evidence verification is not configured on this backend."
        });
    }

    const providedKey = req.get("x-traceon-evidence-admin-key") || "";
    const expectedDigest = crypto.createHash("sha256").update(expectedKey).digest();
    const providedDigest = crypto.createHash("sha256").update(providedKey).digest();
    if (!crypto.timingSafeEqual(expectedDigest, providedDigest)) {
        return res.status(401).json({
            success: false,
            message: "Evidence administrator authorization is required."
        });
    }

    req.evidenceReviewer = "server-admin-key";
    return next();
}

module.exports = requireEvidenceAdmin;
