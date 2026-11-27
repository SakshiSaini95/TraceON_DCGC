const express = require("express");
const db = require("../database/db");
const requireEvidenceAdmin = require("../middleware/requireEvidenceAdmin");
const { SIGNALS, analyzeSellerRisk, getSellerConnections, getSellerEvidence } = require("../services/riskAnalysisService");

const router = express.Router();
const SIGNAL_TYPES = new Set(Object.keys(SIGNALS));
const SEVERITIES = new Set(["low", "medium", "high"]);
const VERIFICATION_SOURCES = new Set([
    "user_submission_review",
    "authorized_public_source",
    "authorized_partner_source",
    "internal_review"
]);
const RELATIONSHIPS = new Set([
    "shared_phone",
    "shared_upi",
    "reused_photo",
    "related_profile"
]);
const ENTITY_TYPES = new Set(["phone", "upi", "photo", "profile"]);

function parseId(value) {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function sellerExists(sellerId) {
    return Boolean(db.prepare("SELECT id FROM seller_profiles WHERE id = ?").get(sellerId));
}

function getConnectionValidationError(sellerId, relatedSellerId, relationshipType) {
    if (relatedSellerId === sellerId) {
        return "A seller cannot be linked to itself.";
    }
    if (!sellerExists(relatedSellerId)) {
        return "Related seller was not found.";
    }

    const source = db.prepare(`
        SELECT phone_lookup_hash, upi_lookup_hash
        FROM seller_profiles
        WHERE id = ?
    `).get(sellerId);
    const related = db.prepare(`
        SELECT phone_lookup_hash, upi_lookup_hash
        FROM seller_profiles
        WHERE id = ?
    `).get(relatedSellerId);

    if (relationshipType === "shared_phone"
        && (!source.phone_lookup_hash || source.phone_lookup_hash !== related.phone_lookup_hash)) {
        return "A shared-phone relationship requires matching encrypted phone identifiers.";
    }
    if (relationshipType === "shared_upi"
        && (!source.upi_lookup_hash || source.upi_lookup_hash !== related.upi_lookup_hash)) {
        return "A shared-UPI relationship requires matching encrypted UPI identifiers.";
    }

    return null;
}

router.get("/:sellerId/risk-analysis", (req, res) => {
    const sellerId = parseId(req.params.sellerId);
    if (!sellerId) {
        return res.status(400).json({ success: false, message: "Seller ID must be a positive integer." });
    }

    try {
        const analysis = analyzeSellerRisk(sellerId);
        if (!analysis) {
            return res.status(404).json({ success: false, message: "Seller not found." });
        }
        return res.json({ success: true, sellerId, analysis });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.get("/:sellerId/connections", (req, res) => {
    const sellerId = parseId(req.params.sellerId);
    if (!sellerId) {
        return res.status(400).json({ success: false, message: "Seller ID must be a positive integer." });
    }

    try {
        const connections = getSellerConnections(sellerId);
        if (!connections) {
            return res.status(404).json({ success: false, message: "Seller not found." });
        }
        return res.json({ success: true, sellerId, connections });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.get("/:sellerId/evidence", (req, res) => {
    const sellerId = parseId(req.params.sellerId);
    if (!sellerId) {
        return res.status(400).json({ success: false, message: "Seller ID must be a positive integer." });
    }

    try {
        const evidence = getSellerEvidence(sellerId);
        if (!evidence) {
            return res.status(404).json({ success: false, message: "Seller not found." });
        }
        return res.json({ success: true, sellerId, count: evidence.length, evidence });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.post("/:sellerId/evidence", (req, res) => {
    const sellerId = parseId(req.params.sellerId);
    if (!sellerId) {
        return res.status(400).json({ success: false, message: "Seller ID must be a positive integer." });
    }
    if (!sellerExists(sellerId)) {
        return res.status(404).json({ success: false, message: "Seller not found." });
    }

    const description = typeof req.body?.description === "string"
        ? req.body.description.trim()
        : "";
    const evidenceUrl = typeof req.body?.evidence_url === "string"
        ? req.body.evidence_url.trim()
        : "";
    if (!description || description.length > 2000) {
        return res.status(400).json({
            success: false,
            message: "Evidence description is required and must be 2000 characters or fewer."
        });
    }
    if (evidenceUrl && evidenceUrl.length > 2000) {
        return res.status(400).json({ success: false, message: "Evidence URL must be 2000 characters or fewer." });
    }

    try {
        const submitEvidence = db.transaction(() => {
            const result = db.prepare(`
                INSERT INTO evidence (
                    seller_id, evidence_url, description, source_type, verification_status
                )
                VALUES (?, ?, ?, 'user_submission', 'unverified')
            `).run(sellerId, evidenceUrl || null, description);
            db.prepare(`
                INSERT INTO evidence_audit (
                    evidence_id, previous_status, new_status, changed_by, source_type
                )
                VALUES (?, NULL, 'unverified', 'user-submission', 'user_submission')
            `).run(result.lastInsertRowid);
            return result.lastInsertRowid;
        });
        const evidenceId = submitEvidence();

        return res.status(201).json({
            success: true,
            message: "Evidence submitted for review. It does not affect the risk score until verified.",
            evidenceId,
            verificationStatus: "unverified"
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.get("/:sellerId/evidence/:evidenceId/review", requireEvidenceAdmin, (req, res) => {
    const sellerId = parseId(req.params.sellerId);
    const evidenceId = parseId(req.params.evidenceId);
    if (!sellerId || !evidenceId) {
        return res.status(400).json({ success: false, message: "Seller and evidence IDs must be positive integers." });
    }

    try {
        const evidence = db.prepare(`
            SELECT id, seller_id, report_id, evidence_url, description,
                   source_type, signal_type, severity, verification_status,
                   related_seller_id, relationship_type, entity_type,
                   created_at, verified_at
            FROM evidence
            WHERE id = ? AND seller_id = ?
        `).get(evidenceId, sellerId);
        if (!evidence) {
            return res.status(404).json({ success: false, message: "Evidence not found." });
        }
        return res.json({ success: true, evidence });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.patch("/:sellerId/evidence/:evidenceId/verification", requireEvidenceAdmin, (req, res) => {
    const sellerId = parseId(req.params.sellerId);
    const evidenceId = parseId(req.params.evidenceId);
    if (!sellerId || !evidenceId) {
        return res.status(400).json({ success: false, message: "Seller and evidence IDs must be positive integers." });
    }

    const decision = req.body?.decision;
    const sourceType = req.body?.source_type;
    if (!["verify", "reject", "revoke"].includes(decision)) {
        return res.status(400).json({ success: false, message: "Decision must be verify, reject, or revoke." });
    }
    if (!VERIFICATION_SOURCES.has(sourceType)) {
        return res.status(400).json({ success: false, message: "A valid verification source is required." });
    }

    const evidence = db.prepare(`
        SELECT id, seller_id, verification_status
        FROM evidence
        WHERE id = ? AND seller_id = ?
    `).get(evidenceId, sellerId);
    if (!evidence) {
        return res.status(404).json({ success: false, message: "Evidence not found." });
    }

    let fields = {
        signalType: null,
        severity: null,
        relatedSellerId: null,
        relationshipType: null,
        entityType: null
    };
    if (decision === "verify") {
        fields = {
            signalType: req.body?.signal_type,
            severity: req.body?.severity,
            relatedSellerId: req.body?.related_seller_id
                ? parseId(req.body.related_seller_id)
                : null,
            relationshipType: req.body?.relationship_type || null,
            entityType: req.body?.entity_type || null
        };

        if (!SIGNAL_TYPES.has(fields.signalType) || !SEVERITIES.has(fields.severity)) {
            return res.status(400).json({ success: false, message: "A supported signal type and severity are required." });
        }
        if (fields.relationshipType && !RELATIONSHIPS.has(fields.relationshipType)) {
            return res.status(400).json({ success: false, message: "Unsupported relationship type." });
        }
        if (fields.entityType && !ENTITY_TYPES.has(fields.entityType)) {
            return res.status(400).json({ success: false, message: "Unsupported entity type." });
        }
        if (fields.relatedSellerId) {
            const relationshipError = getConnectionValidationError(
                sellerId,
                fields.relatedSellerId,
                fields.relationshipType
            );
            if (relationshipError) {
                return res.status(400).json({ success: false, message: relationshipError });
            }
        }
        if (
            fields.signalType === "shared_phone"
            && (!fields.relatedSellerId || fields.relationshipType !== "shared_phone" || fields.entityType !== "phone")
        ) {
            return res.status(400).json({
                success: false,
                message: "Shared-phone evidence must identify the related seller and phone relationship."
            });
        }
        if (
            fields.signalType === "shared_upi"
            && (!fields.relatedSellerId || fields.relationshipType !== "shared_upi" || fields.entityType !== "upi")
        ) {
            return res.status(400).json({
                success: false,
                message: "Shared-UPI evidence must identify the related seller and UPI relationship."
            });
        }
        if (
            fields.signalType === "reused_photo"
            && (!fields.relatedSellerId || fields.relationshipType !== "reused_photo" || fields.entityType !== "photo")
        ) {
            return res.status(400).json({
                success: false,
                message: "Reused-photo evidence must identify the related seller and photo relationship."
            });
        }
        if (
            fields.signalType === "verified_related_account"
            && (!fields.relatedSellerId || fields.relationshipType !== "related_profile")
        ) {
            return res.status(400).json({
                success: false,
                message: "Related-account evidence must identify the related seller profile."
            });
        }
    }

    const nextStatus = decision === "verify"
        ? "verified"
        : decision === "reject"
            ? "rejected"
            : "revoked";
    const verifiedAt = nextStatus === "verified" ? new Date().toISOString() : null;
    const applyReview = db.transaction(() => {
        db.prepare(`
            UPDATE evidence
            SET verification_status = ?,
                source_type = ?,
                signal_type = ?,
                severity = ?,
                related_seller_id = ?,
                relationship_type = ?,
                entity_type = ?,
                verified_by = ?,
                verified_at = ?
            WHERE id = ? AND seller_id = ?
        `).run(
            nextStatus,
            sourceType,
            fields.signalType,
            fields.severity,
            fields.relatedSellerId,
            fields.relationshipType,
            fields.entityType,
            req.evidenceReviewer,
            verifiedAt,
            evidenceId,
            sellerId
        );
        db.prepare(`
            INSERT INTO evidence_audit (
                evidence_id, previous_status, new_status, changed_by, source_type
            )
            VALUES (?, ?, ?, ?, ?)
        `).run(
            evidenceId,
            evidence.verification_status,
            nextStatus,
            req.evidenceReviewer,
            sourceType
        );
    });

    try {
        applyReview();
        return res.json({
            success: true,
            evidenceId,
            verificationStatus: nextStatus
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
