
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    email TEXT UNIQUE,
    phone TEXT,
    user_type TEXT,
    profile_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS seller_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT DEFAULT 'Instagram',
    username TEXT NOT NULL,
    profile_url TEXT,
    phone_ciphertext TEXT,
    phone_lookup_hash TEXT,
    phone_display TEXT,
    upi_id_ciphertext TEXT,
    upi_lookup_hash TEXT,
    upi_display TEXT,
    risk_score INTEGER DEFAULT 0,
    status TEXT DEFAULT 'unknown',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seller_id INTEGER,
    user_id INTEGER,
    reason TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (seller_id) REFERENCES seller_profiles(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id INTEGER,
    seller_id INTEGER,
    evidence_url TEXT,
    description TEXT,
    source_type TEXT NOT NULL DEFAULT 'user_submission',
    source_reference TEXT,
    signal_type TEXT,
    severity TEXT,
    verification_status TEXT NOT NULL DEFAULT 'unverified',
    related_seller_id INTEGER,
    relationship_type TEXT,
    entity_type TEXT,
    verified_by TEXT,
    verified_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (report_id) REFERENCES reports(id)
);

CREATE TABLE IF NOT EXISTS evidence_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    evidence_id INTEGER NOT NULL,
    previous_status TEXT,
    new_status TEXT NOT NULL,
    changed_by TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_reference TEXT,
    note TEXT,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (evidence_id) REFERENCES evidence(id)
);

CREATE TABLE IF NOT EXISTS connection_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    seller_id INTEGER,
    event_type TEXT,
    target_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (seller_id) REFERENCES seller_profiles(id)
);
