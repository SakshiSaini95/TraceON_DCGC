const db = require("../database/db");

const DEFAULT_WEIGHTS = Object.freeze({
    shared_phone: 20,
    shared_upi: 20,
    reused_photo: 30,
    upi_name_mismatch: 25,
    verified_scam_complaint: 35,
    suspicious_account_creation: 20,
    suspicious_profile_url: 20,
    verified_related_account: 30
});

const SEVERITY_MULTIPLIERS = Object.freeze({
    low: 0.5,
    medium: 1,
    high: 1.5
});

const SIGNALS = Object.freeze({
    shared_phone: {
        name: "Phone number linked to another profile",
        explanation: "Verified evidence links this phone number to another profile."
    },
    shared_upi: {
        name: "UPI identifier linked to another profile",
        explanation: "Verified evidence links this UPI ID to another profile."
    },
    reused_photo: {
        name: "Profile photo reuse verified",
        explanation: "A reviewer confirmed this photo appears on another profile."
    },
    upi_name_mismatch: {
        name: "UPI recipient mismatch",
        explanation: "The verified payment recipient does not match the seller identity."
    },
    verified_scam_complaint: {
        name: "Verified complaint",
        explanation: "A reviewer verified a complaint about this seller."
    },
    suspicious_account_creation: {
        name: "Suspicious account creation pattern",
        explanation: "A reviewer confirmed a suspicious account creation pattern."
    },
    suspicious_profile_url: {
        name: "Suspicious profile URL",
        explanation: "A reviewer confirmed this profile URL is suspicious."
    },
    verified_related_account: {
        name: "Verified related account",
        explanation: "A reviewer confirmed a relationship with another profile."
    }
});

const ENTITY_LABELS = Object.freeze({
    phone: "Phone identifier",
    upi: "UPI identifier",
    photo: "Reused photo",
    profile: "Seller profile"
});

function parseJsonSetting(name, fallback) {
    const raw = process.env[name];
    if (!raw) {
        return fallback;
    }

    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("expected an object");
        }
        return parsed;
    } catch (error) {
        throw new Error(`${name} must be a valid JSON object: ${error.message}`);
    }
}

function getRiskConfiguration() {
    const customWeights = parseJsonSetting("TRACEON_RISK_WEIGHTS_JSON", {});
    const customThresholds = parseJsonSetting("TRACEON_RISK_THRESHOLDS_JSON", {});
    const unknownWeights = Object.keys(customWeights).filter((key) => !(key in DEFAULT_WEIGHTS));
    if (unknownWeights.length) {
        throw new Error(`Unknown TRACEON risk weight: ${unknownWeights[0]}`);
    }

    const weights = { ...DEFAULT_WEIGHTS, ...customWeights };
    for (const [signal, weight] of Object.entries(weights)) {
        if (!Number.isInteger(weight) || weight < 1 || weight > 100) {
            throw new Error(`Risk weight for ${signal} must be an integer from 1 to 100.`);
        }
    }

    const thresholds = {
        lowMax: customThresholds.lowMax ?? 29,
        mediumMax: customThresholds.mediumMax ?? 59
    };
    if (
        !Number.isInteger(thresholds.lowMax)
        || !Number.isInteger(thresholds.mediumMax)
        || thresholds.lowMax < 0
        || thresholds.lowMax >= thresholds.mediumMax
        || thresholds.mediumMax >= 100
    ) {
        throw new Error("Risk thresholds must satisfy 0 <= lowMax < mediumMax < 100.");
    }

    return { weights, thresholds };
}

function sourceLabel(sourceType) {
    const labels = {
        user_submission: "User submission",
        user_submission_review: "Reviewed user submission",
        authorized_public_source: "Authorized public source",
        authorized_partner_source: "Authorized partner source",
        internal_review: "Internal review"
    };
    return labels[sourceType] || "Verified source";
}

function getSeller(sellerId) {
    return db.prepare(`
        SELECT id, username, platform, profile_url, phone_display, upi_display
        FROM seller_profiles
        WHERE id = ?
    `).get(sellerId);
}

function getSellerEvidenceRows(sellerId) {
    return db.prepare(`
        SELECT
            evidence.id,
            evidence.signal_type,
            evidence.severity,
            evidence.source_type,
            evidence.source_reference,
            evidence.verification_status,
            evidence.related_seller_id,
            evidence.created_at,
            evidence.verified_at,
            related.username AS related_username,
            related.platform AS related_platform
        FROM evidence
        LEFT JOIN seller_profiles AS related
            ON related.id = evidence.related_seller_id
        WHERE evidence.seller_id = ?
          AND evidence.verification_status = 'verified'
        ORDER BY evidence.id
    `).all(sellerId);
}

function getEvidenceCounts(sellerId) {
    return db.prepare(`
        SELECT
            SUM(CASE WHEN verification_status = 'unverified' THEN 1 ELSE 0 END) AS unverified_count,
            SUM(CASE WHEN verification_status = 'rejected' THEN 1 ELSE 0 END) AS rejected_count
        FROM evidence
        WHERE seller_id = ?
    `).get(sellerId);
}

function analyzeSellerRisk(sellerId) {
    const seller = getSeller(sellerId);
    if (!seller) {
        return null;
    }

    const config = getRiskConfiguration();
    const rows = getSellerEvidenceRows(sellerId)
        .filter((row) => row.signal_type in SIGNALS && row.severity in SEVERITY_MULTIPLIERS);
    const counts = getEvidenceCounts(sellerId);

    if (!rows.length) {
        return {
            status: "insufficient_evidence",
            score: null,
            riskLevel: null,
            summary: "Not enough verified evidence to calculate a score.",
            evidenceConfidence: {
                level: "insufficient",
                basis: "No verified evidence."
            },
            verifiedEvidenceCount: 0,
            unverifiedEvidenceCount: counts.unverified_count || 0,
            signals: [],
            model: {
                version: "1.0",
                weights: config.weights,
                severityMultipliers: SEVERITY_MULTIPLIERS,
                thresholds: config.thresholds,
                aggregation: "Highest severity per signal type; total capped at 100."
            }
        };
    }

    const grouped = new Map();
    for (const row of rows) {
        const definition = SIGNALS[row.signal_type];
        const points = Math.round(
            config.weights[row.signal_type] * SEVERITY_MULTIPLIERS[row.severity]
        );
        const current = grouped.get(row.signal_type);
        const evidence = {
            id: row.id,
            reference: `Evidence #${row.id}`,
            source: sourceLabel(row.source_type),
            verificationStatus: row.verification_status,
            timestamp: row.verified_at || row.created_at
        };
        const associatedSeller = row.related_seller_id && row.related_username
            ? {
                id: row.related_seller_id,
                username: row.related_username,
                platform: row.related_platform
            }
            : { id: seller.id, username: seller.username, platform: seller.platform };

        if (!current) {
            grouped.set(row.signal_type, {
                type: row.signal_type,
                name: definition.name,
                explanation: definition.explanation,
                severity: row.severity,
                points,
                evidence: [evidence],
                associatedSellers: [associatedSeller]
            });
        } else {
            current.evidence.push(evidence);
            if (!current.associatedSellers.some((item) => item.id === associatedSeller.id)) {
                current.associatedSellers.push(associatedSeller);
            }
            if (points > current.points) {
                current.points = points;
                current.severity = row.severity;
            }
        }
    }

    const signals = [...grouped.values()].sort((a, b) => b.points - a.points);
    const score = Math.min(100, signals.reduce((sum, signal) => sum + signal.points, 0));
    const riskLevel = score <= config.thresholds.lowMax
        ? "low"
        : score <= config.thresholds.mediumMax
            ? "medium"
            : "high";
    const distinctEvidence = new Set(
        rows.map((row) => row.source_reference || `evidence:${row.id}`)
    ).size;
    const evidenceConfidence = signals.length > 1 && distinctEvidence > 1
        ? {
            level: "corroborated",
            basis: `${distinctEvidence} verified references across ${signals.length} signal types.`
        }
        : {
            level: "limited",
            basis: "Limited verified evidence."
        };
    const summaries = {
        low: "A few verified warning signals were recorded. This is not a safety guarantee.",
        medium: "Verified risk indicators were recorded. Review the sources before paying.",
        high: "Multiple verified warning signals were recorded. Review the sources before deciding."
    };

    return {
        status: "scored",
        score,
        riskLevel,
        summary: summaries[riskLevel],
        evidenceConfidence,
        verifiedEvidenceCount: rows.length,
        unverifiedEvidenceCount: counts.unverified_count || 0,
        signals,
        model: {
            version: "1.0",
            weights: config.weights,
            severityMultipliers: SEVERITY_MULTIPLIERS,
            thresholds: config.thresholds,
            aggregation: "Highest severity per signal type; total capped at 100."
        }
    };
}

function getSellerEvidence(sellerId) {
    if (!getSeller(sellerId)) {
        return null;
    }

    const evidence = db.prepare(`
        SELECT id, signal_type, severity, source_type, verification_status, created_at, verified_at
        FROM evidence
        WHERE seller_id = ?
        ORDER BY id DESC
    `).all(sellerId).map((row) => ({
        id: row.id,
        reference: `Evidence #${row.id}`,
        signalType: row.signal_type,
        signalName: SIGNALS[row.signal_type]?.name || null,
        severity: row.verification_status === "verified" ? row.severity : null,
        source: sourceLabel(row.source_type),
        verificationStatus: row.verification_status,
        createdAt: row.created_at,
        verifiedAt: row.verified_at
    }));

    return evidence;
}

function getSellerConnections(sellerId) {
    const seller = getSeller(sellerId);
    if (!seller) {
        return null;
    }

    const rows = db.prepare(`
        SELECT
            evidence.id,
            evidence.relationship_type,
            evidence.entity_type,
            evidence.severity,
            evidence.related_seller_id,
            related.username AS related_username,
            related.platform AS related_platform
        FROM evidence
        LEFT JOIN seller_profiles AS related
            ON related.id = evidence.related_seller_id
        WHERE evidence.seller_id = ?
          AND evidence.verification_status = 'verified'
          AND (
              evidence.relationship_type IS NOT NULL
              OR evidence.related_seller_id IS NOT NULL
              OR evidence.entity_type IS NOT NULL
          )
        ORDER BY evidence.id
    `).all(sellerId);

    const nodes = new Map();
    const edges = [];
    for (const row of rows) {
        let entityNode = null;
        if (row.entity_type === "phone" && seller.phone_display) {
            entityNode = {
                id: `phone:${seller.id}`,
                type: "phone",
                label: seller.phone_display
            };
        } else if (row.entity_type === "upi" && seller.upi_display) {
            entityNode = {
                id: `upi:${seller.id}`,
                type: "upi",
                label: seller.upi_display
            };
        } else if (row.entity_type === "photo") {
            entityNode = {
                id: `photo:${row.id}`,
                type: "photo",
                label: ENTITY_LABELS.photo
            };
        }

        if (entityNode) {
            nodes.set(entityNode.id, entityNode);
            edges.push({
                id: `evidence-${row.id}-${entityNode.id}`,
                target: entityNode.id,
                relationshipType: row.relationship_type || row.entity_type,
                evidenceId: row.id,
                severity: row.severity
            });
        }

        if (row.related_seller_id && row.related_username) {
            const profileNode = {
                id: `seller:${row.related_seller_id}`,
                type: "profile",
                label: `@${row.related_username}`,
                platform: row.related_platform
            };
            nodes.set(profileNode.id, profileNode);
            edges.push({
                id: `evidence-${row.id}-${profileNode.id}`,
                target: profileNode.id,
                relationshipType: row.relationship_type || "related_profile",
                evidenceId: row.id,
                severity: row.severity
            });
        }
    }

    return {
        root: {
            id: seller.id,
            type: "seller",
            label: seller.username,
            platform: seller.platform
        },
        nodes: [...nodes.values()],
        edges,
        empty: nodes.size === 0
    };
}

module.exports = {
    ENTITY_LABELS,
    SEVERITY_MULTIPLIERS,
    SIGNALS,
    analyzeSellerRisk,
    getRiskConfiguration,
    getSellerConnections,
    getSellerEvidence
};
