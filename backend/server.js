
const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const db = require("./database/db");

const app = express();

const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
// Import routes
const userRoutes = require("./routes/userRoutes");
const sellerRoutes = require("./routes/sellerRoutes");
const riskAnalysisRoutes = require("./routes/riskAnalysisRoutes");
const reportRoutes = require("./routes/reportRoutes");
const linkRoutes = require("./routes/linkRoutes");

// Register routes
app.use("/api/users", userRoutes);
app.use("/api/sellers", sellerRoutes);
app.use("/api/sellers", riskAnalysisRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/links", linkRoutes);

// Health check API
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "TRACEON backend is running!",
        database: "SQLite connected"
    });
});

// Database test API
app.get("/api/test-db", (req, res) => {
    try {
        const result = db.prepare("SELECT sqlite_version() AS version").get();

        res.json({
            success: true,
            message: "Database working successfully!",
            sqliteVersion: result.version
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`TRACEON backend running on port ${PORT}`);
});

