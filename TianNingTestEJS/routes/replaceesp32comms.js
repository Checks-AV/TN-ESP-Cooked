const express = require("express");
const router = express.Router();

// ─── POST /esp32comms/register ────────────────────────────────
// ESP32 taggers call this on boot to announce themselves
router.post("/register", (req, res, next) => {
    const { device_mac, device_type, ip_address } = req.body;

    if (!device_mac) {
        return res.status(400).json({ error: "Missing device_mac" });
    }

    const now = new Date().toISOString();

    global.db.run(
        `INSERT INTO ESP32Devices (device_mac, device_type, ip_address, last_seen)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(device_mac) DO UPDATE SET
             ip_address = excluded.ip_address,
             last_seen  = excluded.last_seen,
             device_type = COALESCE(excluded.device_type, device_type)`,
        [device_mac, device_type || null, ip_address || null, now],
        function (err) {
            if (err) return next(err);
            console.log(`[REGISTER] ${device_mac} | type: ${device_type} | ip: ${ip_address}`);
            res.json({ success: true, message: "Registered", device_mac });
        }
    );
});

// ─── POST /esp32comms/listen ──────────────────────────────────
// Only TAGGER ESP32s send messages here
// They report: "I scanned tag X and performed action Y"
router.post("/listen", (req, res, next) => {
    const { device_mac, message_type, payload } = req.body;

    if (!device_mac || !message_type) {
        return res.status(400).json({ error: "Missing device_mac or message_type" });
    }

    const now = new Date().toISOString();

    // Always update last_seen for any message
    global.db.run(
        `UPDATE ESP32Devices SET last_seen = ? WHERE device_mac = ?`,
        [now, device_mac],
        (err) => {
            if (err) return next(err);

            console.log(`[LISTEN] Tagger ${device_mac} | ${message_type} | ${JSON.stringify(payload)}`);

            if (message_type === "ping") {
                return res.json({ success: true, message: "pong" });
            }

            if (message_type === "action") {
                return handleAction(req, res, next, device_mac, payload);
            }

            return res.status(400).json({ error: `Unknown message_type: ${message_type}` });
        }
    );
});

// ─── INTERNAL: handle action from TAGGER ──────────────────────
// Tagger sends: { tag_mac, action_name }
// Server validates tagger exists and tag is assigned to ingredient,
// then appends action to current_status
function handleAction(req, res, next, tagger_mac, payload) {
    const { tag_mac, action_name } = payload || {};

    if (!tag_mac || !action_name) {
        return res.status(400).json({ 
            error: "action needs tag_mac and action_name in payload" 
        });
    }

    // STEP 1: Validate the tagger exists
    global.db.get(
        `SELECT device_id FROM ESP32Devices WHERE device_mac = ?`,
        [tagger_mac],
        (err, tagger) => {
            if (err) return next(err);
            if (!tagger) {
                return res.status(404).json({ 
                    error: "Tagger device not found. Please register first." 
                });
            }

            // STEP 2: Validate the tag exists AND is assigned to an ingredient
            global.db.get(
                `SELECT et.device_id, et.current_status, i.ingredients_name
                 FROM ESP32Tags et
                 JOIN ingredients i ON et.ingredients_id = i.ingredients_id
                 JOIN ESP32Devices ed ON et.device_id = ed.device_id
                 WHERE ed.device_mac = ?`,
                [tag_mac],
                (err, tag) => {
                    if (err) return next(err);
                    if (!tag) {
                        return res.status(404).json({ 
                            error: "Tag not assigned to any ingredient. Please assign it in the web interface first." 
                        });
                    }

                    // STEP 3: Append the new action to current_status
                    const currentStatus = tag.current_status || 'Default';
                    const newStatus = currentStatus + ' → ' + action_name;

                    global.db.run(
                        `UPDATE ESP32Tags 
                         SET current_status = ? 
                         WHERE device_id = ?`,
                        [newStatus, tag.device_id],
                        function (err) {
                            if (err) return next(err);

                            console.log(`[ACTION] Tag ${tag_mac} (${tag.ingredients_name}) | ${currentStatus} → ${newStatus}`);

                            res.json({ 
                                success: true,
                                tag_mac: tag_mac,
                                ingredient: tag.ingredients_name,
                                previous_status: currentStatus,
                                new_status: newStatus,
                                action_performed: action_name,
                                message: `${tag.ingredients_name}: ${currentStatus} → ${newStatus}`
                            });
                        }
                    );
                }
            );
        }
    );
}

// ─── POST /esp32comms/assign-tag ──────────────────────────────
// WEB INTERFACE ONLY: Link a tag device to an ingredient
// This is a one-time setup done by staff
router.post("/assign-tag", (req, res, next) => {
    const { device_mac, ingredients_id } = req.body;

    global.db.get(
        `SELECT device_id FROM ESP32Devices WHERE device_mac = ?`,
        [device_mac],
        (err, device) => {
            if (err) return next(err);
            if (!device) return res.status(404).send("Device MAC not found. Register it first.");

            global.db.run(
                `INSERT INTO ESP32Tags (device_id, ingredients_id, current_status)
                 VALUES (?, ?, 'Default')
                 ON CONFLICT(device_id) DO UPDATE SET 
                     ingredients_id = excluded.ingredients_id,
                     current_status = 'Default'`,
                [device.device_id, ingredients_id],
                (err) => {
                    if (err) return next(err);
                    console.log(`[ASSIGN-TAG] ${device_mac} → ingredient ${ingredients_id}`);
                    res.redirect("/settings/esp32");
                }
            );
        }
    );
});

// ─── POST /esp32comms/assign-tagger ──────────────────────────
// WEB INTERFACE ONLY: Link a tagger device to a station
// This is a one-time setup done by staff
router.post("/assign-tagger", (req, res, next) => {
    const { device_mac, station_id } = req.body;

    global.db.get(
        `SELECT device_id FROM ESP32Devices WHERE device_mac = ?`,
        [device_mac],
        (err, device) => {
            if (err) return next(err);
            if (!device) return res.status(404).send("Device MAC not found. Register it first.");

            global.db.run(
                `INSERT INTO ESP32Tagger (device_id, station_id)
                 VALUES (?, ?)
                 ON CONFLICT(device_id) DO UPDATE SET station_id = excluded.station_id`,
                [device.device_id, station_id],
                (err) => {
                    if (err) return next(err);
                    console.log(`[ASSIGN-TAGGER] ${device_mac} → station ${station_id}`);
                    res.redirect("/settings/esp32");
                }
            );
        }
    );
});

// ─── POST /esp32comms/update ──────────────────────────────────
// WEB INTERFACE ONLY: Update device info from the modal
router.post("/update", (req, res, next) => {
    const { esp32_id, device_mac, ip_address, device_type } = req.body;
    
    if (!esp32_id || !device_mac) {
        return res.status(400).send("Device ID and MAC address are required");
    }
    
    global.db.get(
        `SELECT * FROM ESP32Devices WHERE esp32_id = ?`,
        [esp32_id],
        (err, device) => {
            if (err) return next(err);
            if (!device) return res.status(404).send("Device not found");
            
            global.db.run(
                `UPDATE ESP32Devices 
                 SET device_mac = ?, 
                     ip_address = ?, 
                     device_type = ?
                 WHERE esp32_id = ?`,
                [device_mac, ip_address || null, device_type || null, esp32_id],
                function(err) {
                    if (err) return next(err);
                    console.log(`[UPDATE] Device ${esp32_id} updated successfully`);
                    res.redirect("/settings/esp32");
                }
            );
        }
    );
});

// ─── POST /esp32comms/esp32/send ──────────────────────────────
// WEB INTERFACE ONLY: Manually send a message to an ESP32
// This is for testing/debugging purposes
router.post("/esp32/send", (req, res, next) => {
    const { ip_address, message } = req.body;
    
    if (!ip_address || !message) {
        return res.status(400).send("IP address and message are required");
    }
    
    // This would send a message to the ESP32 via HTTP
    // For now, just log it
    console.log(`[SEND] To ${ip_address}: ${message}`);
    res.send(`Message sent to ${ip_address}: ${message}`);
});

module.exports = router;