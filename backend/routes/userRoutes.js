
const express = require("express");
const router = express.Router();
const db = require("../database/db");

// Get all users
router.get("/", (req, res) => {
    try {
        const users = db.prepare(
            "SELECT id, username, email, phone, user_type, profile_url, created_at FROM users"
        ).all();

        res.json({
            success: true,
            count: users.length,
            users
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Register a user
router.post("/", (req, res) => {
    try {
        const username = typeof req.body?.username === "string"
            ? req.body.username.trim()
            : "";
        const email = typeof req.body?.email === "string"
            ? req.body.email.trim().toLowerCase()
            : "";
        const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
        const userType = typeof req.body?.user_type === "string" ? req.body.user_type.trim() : "";
        const profileUrl = typeof req.body?.profile_url === "string" ? req.body.profile_url.trim() : "";

        if (!username || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                success: false,
                message: "A full name and valid email are required"
            });
        }

        const existingUser = db.prepare(
            "SELECT id FROM users WHERE LOWER(email) = LOWER(?)"
        ).get(email);

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "A registration with this email already exists"
            });
        }

        const result = db.prepare(`
            INSERT INTO users (username, email, phone, user_type, profile_url)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            username,
            email,
            phone || null,
            userType || null,
            profileUrl || null
        );

        res.status(201).json({
            success: true,
            message: "User registered successfully",
            userId: result.lastInsertRowid
        });
    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).json({
                success: false,
                message: "A registration with this email already exists"
            });
        }
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
