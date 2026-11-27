
const express = require("express");
const router = express.Router();
const db = require("../database/db");

// Get all reports
router.get("/", (req, res) => {
    try {
        const reports = db.prepare(`
            SELECT reports.*, seller_profiles.username
            FROM reports
            LEFT JOIN seller_profiles
            ON reports.seller_id = seller_profiles.id
            ORDER BY reports.id DESC
        `).all();

        res.json({
            success: true,
            count: reports.length,
            reports
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Submit a report
router.post("/", (req, res) => {
    try {
        const { seller_id, user_id, reason, description } = req.body;

        if (!seller_id || !reason) {
            return res.status(400).json({
                success: false,
                message: "Seller ID and reason are required"
            });
        }

        const seller = db.prepare(
            "SELECT id FROM seller_profiles WHERE id = ?"
        ).get(seller_id);

        if (!seller) {
            return res.status(404).json({
                success: false,
                message: "Seller not found"
            });
        }

        const result = db.prepare(`
            INSERT INTO reports
            (seller_id, user_id, reason, description)
            VALUES (?, ?, ?, ?)
        `).run(
            seller_id,
            user_id || null,
            reason,
            description || null
        );

        res.status(201).json({
            success: true,
            message: "Report submitted successfully",
            reportId: result.lastInsertRowid
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
