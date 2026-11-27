const express = require("express");
const router = express.Router();
const db = require("../database/db");
const {
    createEncryptedSellerIdentifiers,
    getEncryptionKey,
    identifierLookupHash,
    normalizePhone,
    normalizeUpi,
    serializeSeller
} = require("../services/piiService");

router.get("/", (req, res) => {
    try {
        const sellers = db.prepare(
            "SELECT * FROM seller_profiles ORDER BY id DESC"
        ).all().map(serializeSeller);

        res.json({
            success: true,
            count: sellers.length,
            sellers
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

router.post("/", (req, res) => {
    try {
        const username = typeof req.body?.username === "string"
            ? req.body.username.trim()
            : "";
        const profileUrl = typeof req.body?.profile_url === "string"
            ? req.body.profile_url.trim()
            : "";
        const phone = typeof req.body?.phone === "string"
            ? req.body.phone.trim()
            : "";
        const upiId = typeof req.body?.upi_id === "string"
            ? req.body.upi_id.trim()
            : "";
        const platform = typeof req.body?.platform === "string" && req.body.platform.trim()
            ? req.body.platform.trim()
            : "Instagram";

        if (!username) {
            return res.status(400).json({
                success: false,
                message: "Username is required"
            });
        }

        const existingSeller = db.prepare(`
            SELECT id
            FROM seller_profiles
            WHERE (LOWER(username) = LOWER(?) AND LOWER(COALESCE(platform, '')) = LOWER(?))
               OR (? <> '' AND LOWER(COALESCE(profile_url, '')) = LOWER(?))
            LIMIT 1
        `).get(username, platform, profileUrl, profileUrl);

        if (existingSeller) {
            return res.status(409).json({
                success: false,
                message: "Seller is already registered",
                sellerId: existingSeller.id
            });
        }

        let identifiers;
        try {
            identifiers = createEncryptedSellerIdentifiers(phone, upiId);
        } catch (error) {
            const status = error.message.includes("requires TRACEON_PII_ENCRYPTION_KEY")
                ? 503
                : 400;
            return res.status(status).json({
                success: false,
                message: error.message
            });
        }

        const result = db.prepare(`
            INSERT INTO seller_profiles (
                username, profile_url, platform, phone_ciphertext,
                phone_lookup_hash, phone_display, upi_id_ciphertext,
                upi_lookup_hash, upi_display
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            username,
            profileUrl || null,
            platform,
            identifiers.phone_ciphertext,
            identifiers.phone_lookup_hash,
            identifiers.phone_display,
            identifiers.upi_id_ciphertext,
            identifiers.upi_lookup_hash,
            identifiers.upi_display
        );

        res.status(201).json({
            success: true,
            message: "Seller added successfully",
            sellerId: result.lastInsertRowid
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

router.get("/lookup", (req, res) => {
    try {
        const query = typeof req.query.query === "string" ? req.query.query.trim() : "";

        if (!query) {
            return res.status(400).json({
                success: false,
                found: false,
                message: "Please provide a seller username, phone number, UPI ID, or profile link"
            });
        }

        const searchTerm = query.replace(/^@/, "");
        const phoneSearch = /^[+\d\s()./-]+$/.test(query) ? normalizePhone(query) : "";
        const upiSearch = normalizeUpi(query);
        if ((phoneSearch || upiSearch) && !getEncryptionKey()) {
            return res.status(503).json({
                success: false,
                found: false,
                message: "Phone and UPI lookup requires TRACEON_PII_ENCRYPTION_KEY to be configured."
            });
        }
        const phoneHash = phoneSearch ? identifierLookupHash("phone", phoneSearch) : null;
        const upiHash = upiSearch ? identifierLookupHash("upi", upiSearch) : null;
        const seller = db.prepare(`
            SELECT *
            FROM seller_profiles
            WHERE LOWER(username) = LOWER(?)
               OR LOWER(profile_url) LIKE LOWER(?)
               OR (? IS NOT NULL AND phone_lookup_hash = ?)
               OR (? IS NOT NULL AND upi_lookup_hash = ?)
            LIMIT 1
        `).get(
            searchTerm,
            `%${searchTerm}%`,
            phoneHash,
            phoneHash,
            upiHash,
            upiHash
        );

        if (!seller) {
            return res.status(404).json({
                success: false,
                found: false,
                message: "Seller not found in TRACEON database"
            });
        }

        res.json({
            success: true,
            found: true,
            seller: serializeSeller(seller),
            matchedBy: seller.username.toLowerCase() === searchTerm.toLowerCase()
                ? "username"
                : seller.profile_url?.toLowerCase().includes(searchTerm.toLowerCase())
                    ? "profile_url"
                    : phoneHash && seller.phone_lookup_hash === phoneHash
                        ? "phone"
                        : "upi_id"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            found: false,
            message: error.message
        });
    }
});

module.exports = router;
