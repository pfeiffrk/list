const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

/**
 * HTTP endpoint to add a voice/text note.
 *
 * POST /addNote
 * Headers: Authorization: Bearer <Firebase ID Token>
 * Body: { "text": "Note content here" }
 *
 * The note is atomically appended to the user's samsung_notes array
 * in Firebase Realtime Database.
 */
exports.addNote = functions.https.onRequest(async (req, res) => {
    // CORS headers
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
        return res.status(204).send("");
    }

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    // Verify Firebase Auth token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or invalid Authorization header" });
    }

    const idToken = authHeader.split("Bearer ")[1];
    let uid;
    try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        uid = decoded.uid;
    } catch (err) {
        return res.status(401).json({ error: "Invalid token: " + err.message });
    }

    // Validate body
    const { text } = req.body;
    if (!text || typeof text !== "string" || !text.trim()) {
        return res.status(400).json({ error: "Missing or empty 'text' field" });
    }

    const SN_KEY = "samsung_notes";
    const note = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
        text: text.trim(),
        createdAt: Date.now(),
    };

    // Atomic append using transaction
    const ref = admin.database().ref("users/" + uid + "/" + SN_KEY);
    try {
        await ref.transaction((currentVal) => {
            let notes = [];
            if (currentVal) {
                try {
                    notes = JSON.parse(currentVal);
                } catch (e) {
                    notes = [];
                }
            }
            if (!Array.isArray(notes)) notes = [];
            notes.push(note);
            return JSON.stringify(notes);
        });

        // Update _lastModified
        await admin.database().ref("users/" + uid + "/_lastModified").set(Date.now());

        return res.status(200).json({ success: true, note });
    } catch (err) {
        return res.status(500).json({ error: "Failed to save note: " + err.message });
    }
});
