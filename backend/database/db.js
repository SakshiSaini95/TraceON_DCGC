
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dbPath = path.join(__dirname, "traceon.db");

const db = new Database(dbPath);

// Enable foreign key relationships
db.pragma("foreign_keys = ON");

// Read and execute database schema
const schemaPath = path.join(__dirname, "schema.sql");
const schema = fs.readFileSync(schemaPath, "utf8");

db.exec(schema);

function addMissingColumns(tableName, columns) {
    const existingColumns = new Set(
        db.pragma(`table_info(${tableName})`).map((column) => column.name)
    );

    for (const [column, type] of columns) {
        if (!existingColumns.has(column)) {
            db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${column} ${type}`);
        }
    }
}

const userColumns = new Set(
    db.pragma("table_info(users)").map((column) => column.name)
);

for (const [column, type] of [
    ["phone", "TEXT"],
    ["user_type", "TEXT"],
    ["profile_url", "TEXT"]
]) {
    if (!userColumns.has(column)) {
        db.exec(`ALTER TABLE users ADD COLUMN ${column} ${type}`);
    }
}

addMissingColumns("seller_profiles", [
    ["phone_ciphertext", "TEXT"],
    ["phone_lookup_hash", "TEXT"],
    ["phone_display", "TEXT"],
    ["upi_id_ciphertext", "TEXT"],
    ["upi_lookup_hash", "TEXT"],
    ["upi_display", "TEXT"]
]);

addMissingColumns("evidence", [
    ["seller_id", "INTEGER"],
    ["source_type", "TEXT NOT NULL DEFAULT 'user_submission'"],
    ["source_reference", "TEXT"],
    ["signal_type", "TEXT"],
    ["severity", "TEXT"],
    ["verification_status", "TEXT NOT NULL DEFAULT 'unverified'"],
    ["related_seller_id", "INTEGER"],
    ["relationship_type", "TEXT"],
    ["entity_type", "TEXT"],
    ["verified_by", "TEXT"],
    ["verified_at", "DATETIME"]
]);

addMissingColumns("evidence_audit", [
    ["source_type", "TEXT NOT NULL DEFAULT 'legacy'"]
]);

db.exec(`
    UPDATE evidence
    SET seller_id = (
        SELECT reports.seller_id
        FROM reports
        WHERE reports.id = evidence.report_id
    )
    WHERE seller_id IS NULL AND report_id IS NOT NULL;
`);

const sellerColumns = new Set(
    db.pragma("table_info(seller_profiles)").map((column) => column.name)
);
const hasLegacySellerIdentifiers = sellerColumns.has("phone") || sellerColumns.has("upi_id");
if (hasLegacySellerIdentifiers) {
    const legacyRows = db.prepare(`
        SELECT id, phone, upi_id, phone_ciphertext, upi_id_ciphertext
        FROM seller_profiles
        WHERE (phone IS NOT NULL AND TRIM(phone) <> '')
           OR (upi_id IS NOT NULL AND TRIM(upi_id) <> '')
    `).all();

    if (legacyRows.length) {
        const {
            createEncryptedSellerIdentifiers,
            getEncryptionKey,
            identifierLookupHash,
            maskPhone,
            maskUpi,
            normalizePhone,
            normalizeUpi
        } = require("../services/piiService");

        if (!getEncryptionKey()) {
            throw new Error(
                "Legacy seller phone/UPI values must be encrypted before startup. Configure TRACEON_PII_ENCRYPTION_KEY."
            );
        }

        const migrateLegacyIdentifiers = db.transaction(() => {
            const updateSeller = db.prepare(`
                UPDATE seller_profiles
                SET phone_ciphertext = COALESCE(phone_ciphertext, ?),
                    phone_lookup_hash = COALESCE(phone_lookup_hash, ?),
                    phone_display = COALESCE(phone_display, ?),
                    upi_id_ciphertext = COALESCE(upi_id_ciphertext, ?),
                    upi_lookup_hash = COALESCE(upi_lookup_hash, ?),
                    upi_display = COALESCE(upi_display, ?),
                    phone = NULL,
                    upi_id = NULL
                WHERE id = ?
            `);

            for (const row of legacyRows) {
                const encrypted = createEncryptedSellerIdentifiers(row.phone, row.upi_id);
                const phone = row.phone_ciphertext
                    ? {
                        phone_ciphertext: row.phone_ciphertext,
                        phone_lookup_hash: row.phone
                            ? identifierLookupHash("phone", normalizePhone(row.phone))
                            : null,
                        phone_display: row.phone ? maskPhone(row.phone) : null
                    }
                    : encrypted;
                const upi = row.upi_id_ciphertext
                    ? {
                        upi_id_ciphertext: row.upi_id_ciphertext,
                        upi_lookup_hash: row.upi_id
                            ? identifierLookupHash("upi", normalizeUpi(row.upi_id))
                            : null,
                        upi_display: row.upi_id ? maskUpi(row.upi_id) : null
                    }
                    : encrypted;

                updateSeller.run(
                    phone.phone_ciphertext,
                    phone.phone_lookup_hash,
                    phone.phone_display,
                    upi.upi_id_ciphertext,
                    upi.upi_lookup_hash,
                    upi.upi_display,
                    row.id
                );
            }
        });

        migrateLegacyIdentifiers();
    }
}

db.exec(`
    CREATE INDEX IF NOT EXISTS idx_seller_phone_lookup_hash
        ON seller_profiles(phone_lookup_hash);
    CREATE INDEX IF NOT EXISTS idx_seller_upi_lookup_hash
        ON seller_profiles(upi_lookup_hash);
    CREATE INDEX IF NOT EXISTS idx_evidence_seller_verification
        ON evidence(seller_id, verification_status);
    CREATE INDEX IF NOT EXISTS idx_evidence_related_seller
        ON evidence(related_seller_id, verification_status);
`);


db.exec(`
    CREATE TABLE IF NOT EXISTS link_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        reporter_key TEXT,
        verification_status TEXT NOT NULL DEFAULT 'unverified',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_link_report_duplicate
    ON link_reports(domain, reporter_key)
    WHERE reporter_key IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_link_reports_domain
    ON link_reports(domain);
`);
console.log("SQLite database connected successfully!");

module.exports = db;

