const crypto = require("crypto");

function getEncryptionKey() {
    const configuredKey = process.env.TRACEON_PII_ENCRYPTION_KEY;
    if (!configuredKey) {
        return null;
    }

    if (!/^[0-9a-fA-F]{64}$/.test(configuredKey)) {
        throw new Error("TRACEON_PII_ENCRYPTION_KEY must be 64 hexadecimal characters.");
    }

    return Buffer.from(configuredKey, "hex");
}

function requireEncryptionKey() {
    const key = getEncryptionKey();
    if (!key) {
        throw new Error("Seller phone and UPI storage requires TRACEON_PII_ENCRYPTION_KEY.");
    }
    return key;
}

function normalizePhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    return digits.length >= 7 && digits.length <= 15 ? digits : "";
}

function normalizeUpi(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized.length <= 255 && /^[a-z0-9._-]+@[a-z0-9.-]+$/.test(normalized)
        ? normalized
        : "";
}

function encryptIdentifier(value) {
    const key = requireEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
        cipher.update(String(value), "utf8"),
        cipher.final()
    ]);

    return [
        "v1",
        iv.toString("base64"),
        cipher.getAuthTag().toString("base64"),
        ciphertext.toString("base64")
    ].join(".");
}

function decryptIdentifier(value) {
    const [version, ivValue, tagValue, ciphertextValue] = String(value || "").split(".");
    if (version !== "v1" || !ivValue || !tagValue || ciphertextValue === undefined) {
        throw new Error("Stored seller identifier has an unsupported encryption format.");
    }

    const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        requireEncryptionKey(),
        Buffer.from(ivValue, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64"));
    return Buffer.concat([
        decipher.update(Buffer.from(ciphertextValue, "base64")),
        decipher.final()
    ]).toString("utf8");
}

function identifierLookupHash(kind, value) {
    const key = requireEncryptionKey();
    const lookupKey = crypto.createHmac("sha256", key)
        .update("TRACEON:PII:lookup:v1")
        .digest();

    return crypto.createHmac("sha256", lookupKey)
        .update(`${kind}:${value}`)
        .digest("hex");
}

function maskPhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    return digits.length >= 4 ? `•••• •••• ${digits.slice(-4)}` : "••••";
}

function maskUpi(value) {
    const normalized = normalizeUpi(value);
    if (!normalized) {
        return null;
    }

    return `${normalized[0]}••••@•••`;
}

function createEncryptedSellerIdentifiers(phoneValue, upiValue) {
    const phone = String(phoneValue || "").trim();
    const upiId = String(upiValue || "").trim();

    if (phone && !normalizePhone(phone)) {
        throw new Error("Phone number must contain between 7 and 15 digits.");
    }
    if (upiId && !normalizeUpi(upiId)) {
        throw new Error("Enter a valid UPI ID.");
    }
    if (!phone && !upiId) {
        return {
            phone_ciphertext: null,
            phone_lookup_hash: null,
            phone_display: null,
            upi_id_ciphertext: null,
            upi_lookup_hash: null,
            upi_display: null
        };
    }

    return {
        phone_ciphertext: phone ? encryptIdentifier(phone) : null,
        phone_lookup_hash: phone
            ? identifierLookupHash("phone", normalizePhone(phone))
            : null,
        phone_display: phone ? maskPhone(phone) : null,
        upi_id_ciphertext: upiId ? encryptIdentifier(upiId) : null,
        upi_lookup_hash: upiId
            ? identifierLookupHash("upi", normalizeUpi(upiId))
            : null,
        upi_display: upiId ? maskUpi(upiId) : null
    };
}

function serializeSeller(row) {
    const {
        phone,
        upi_id,
        phone_ciphertext,
        phone_lookup_hash,
        phone_display,
        upi_id_ciphertext,
        upi_lookup_hash,
        upi_display,
        ...seller
    } = row;

    return {
        ...seller,
        phone: phone_display || (phone ? maskPhone(phone) : null),
        upi_id: upi_display || (upi_id ? maskUpi(upi_id) : null)
    };
}

module.exports = {
    createEncryptedSellerIdentifiers,
    decryptIdentifier,
    getEncryptionKey,
    identifierLookupHash,
    maskPhone,
    maskUpi,
    normalizePhone,
    normalizeUpi,
    serializeSeller
};
