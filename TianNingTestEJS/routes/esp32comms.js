const express = require("express");
const router = express.Router();

// ─── POST /esp32comms/register ────────────────────────────────
// ESP32 calls this on boot to announce itself
// Body: { device_mac, station_id, ip_address }
router.post("/register", (req, res, next) => {
    const {
        device_mac,
        station_id,
        ip_address
    } = req.body;

    if (!device_mac) {
        return res.status(400).json({
            success: false,
            error: "Missing device_mac"
        });
    }

    if (!station_id) {
        return res.status(400).json({
            success: false,
            error: "Missing station_id"
        });
    }

    const now = new Date().toISOString();

    // First insert or update the ESP32 network device.
    global.db.run(
        `
        INSERT INTO ESP32Devices (
            device_mac,
            ip_address,
            last_seen
        )
        VALUES (?, ?, ?)

        ON CONFLICT(device_mac)
        DO UPDATE SET
            ip_address = excluded.ip_address,
            last_seen = excluded.last_seen
        `,
        [
            device_mac,
            ip_address || null,
            now
        ],
        function (err) {
            if (err) return next(err);

            // Get the device_id because an UPDATE does not reliably
            // give us the existing row's ID.
            global.db.get(
                `
                SELECT device_id
                FROM ESP32Devices
                WHERE device_mac = ?
                `,
                [device_mac],
                (err, device) => {
                    if (err) return next(err);

                    if (!device) {
                        return res.status(500).json({
                            success: false,
                            error: "Device registration failed"
                        });
                    }

                    // Assign the ESP32 to a station.
                    global.db.run(
                        `
                        INSERT INTO ESP32Tagger (
                            device_id,
                            station_id
                        )
                        VALUES (?, ?)

                        ON CONFLICT(device_id)
                        DO UPDATE SET
                            station_id = excluded.station_id
                        `,
                        [
                            device.device_id,
                            station_id
                        ],
                        function (err) {
                            if (err) return next(err);

                            console.log(
                                `[REGISTER] ${device_mac} | ` +
                                `station: ${station_id} | ` +
                                `ip: ${ip_address || "N/A"}`
                            );

                            return res.json({
                                success: true,
                                message: "ESP32 registered successfully",
                                device_id: device.device_id,
                                device_mac,
                                station_id
                            });
                        }
                    );
                }
            );
        }
    );
});

// ─── POST /esp32comms/listen ──────────────────────────────────
// Always-on listener: every ESP32 message comes here
// Body: { device_mac, message_type, payload }
//
// device_mac here is always the STATION's ESP32 (tags are passive RFID,
// they don't have their own MAC / network identity).
//
// message_type options:
//   "action"  → payload: { tag_rfid, action_name }
//               station reports it performed `action_name` on `tag_rfid`
//   "submit"  → handled separately via /api/esp/submit in ticketrail.js
//   "ping"    → payload: {} (just a heartbeat, updates last_seen)
//
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

            console.log(`[LISTEN] ${device_mac} | ${message_type} | ${JSON.stringify(payload)}`);

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

// ─── INTERNAL: handle action ──────────────────────────────────
// device_mac: the STATION's ESP32 MAC (not the tag — tags are passive RFID)
// payload: { tag_rfid, action_name }
//
// Validates that the sending station is actually allowed to perform
// action_name (via station_preparation_method), then appends the action
// to that tag's current_status chain (e.g. "Default → Chopped → Cooked").
function handleAction(req, res, next, device_mac, payload) {
    const { tag_rfid, action_name } = payload || {};

    if (!tag_rfid || !action_name) {
        return res.status(400).json({ error: "action needs tag_rfid and action_name in payload" });
    }

    // 1. Find which station this ESP32 is assigned to
    global.db.get(
        `SELECT et.station_id, s.station_name
         FROM ESP32Devices ed
         JOIN ESP32Tagger et ON et.device_id = ed.device_id
         JOIN station s ON s.station_id = et.station_id
         WHERE ed.device_mac = ?`,
        [device_mac],
        (err, station) => {
            if (err) return next(err);
            if (!station) {
                return res.status(404).json({
                    error: `Device ${device_mac} is not registered or has no station assigned`
                });
            }

            // 2. Confirm this station is allowed to perform this preparation method
            global.db.get(
                `SELECT pm.preparation_method_id
                 FROM station_preparation_method spm
                 JOIN preparation_method pm ON pm.preparation_method_id = spm.preparation_method_id
                 WHERE spm.station_id = ? AND pm.preparation_method_name = ?`,
                [station.station_id, action_name],
                (err, allowed) => {
                    if (err) return next(err);
                    if (!allowed) {
                        return res.status(403).json({
                            error: `Station "${station.station_name}" cannot perform "${action_name}"`
                        });
                    }

                    // 3. Find the tag and its current status
                    global.db.get(
                        `SELECT tag_id, ingredients_id, current_status FROM RFIDTags WHERE tag_rfid = ?`,
                        [tag_rfid],
                        (err, tag) => {
                            if (err) return next(err);
                            if (!tag) {
                                return res.status(404).json({
                                    error: `Tag ${tag_rfid} is not assigned to any ingredient`
                                });
                            }

                            // 4. Append the action to the status chain
                            const base = (!tag.current_status || tag.current_status === '1')
                                ? 'Default'
                                : tag.current_status;
                            const newStatus = `${base} → ${action_name}`;

                            global.db.run(
                                `UPDATE RFIDTags SET current_status = ? WHERE tag_id = ?`,
                                [newStatus, tag.tag_id],
                                function (err) {
                                    if (err) return next(err);

                                    console.log(
                                        `[ACTION] Tag ${tag_rfid} @ station "${station.station_name}" ` +
                                        `→ ${newStatus}`
                                    );

                                    res.json({
                                        success: true,
                                        tag_rfid,
                                        station: station.station_name,
                                        new_status: newStatus
                                    });
                                }
                            );
                        }
                    );
                }
            );
        }
    );
}

// ─── POST /esp32comms/assign-tag ──────────────────────────────
// Link a passive RFID tag to an ingredient
router.post("/assign-tag", (req, res, next) => {
    const { tag_rfid, ingredients_id } = req.body;

    if (!tag_rfid || !ingredients_id) {
        return res.status(400).send(
            "RFID tag and ingredient are required."
        );
    }

    global.db.run(
        `
        INSERT INTO RFIDTags (
            tag_rfid,
            ingredients_id,
            current_status
        )
        VALUES (?, ?, 'Default')

        ON CONFLICT(tag_rfid)
        DO UPDATE SET
            ingredients_id = excluded.ingredients_id,
            current_status = 'Default'
        `,
        [tag_rfid, ingredients_id],
        function (err) {
            if (err) {
                return next(err);
            }

            console.log(
                `[ASSIGN-TAG] ${tag_rfid} → ingredient ${ingredients_id}`
            );

            res.redirect("/settings/esp32");
        }
    );
});

// ─── POST /esp32comms/assign-tagger ──────────────────────────
// Link a tagger (station) device to a station
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

// ─── POST /esp32comms/update ───────────────────────────────────
// Handle the update submission from the ESP32 edit modal
router.post("/update", (req, res, next) => {
    const {
        device_id,
        device_mac,
        ip_address,
        station_id
    } = req.body;

    if (!device_id || !device_mac || !station_id) {
        return res.status(400).send(
            "Device ID, MAC address and station are required"
        );
    }

    // Check that the ESP32 device exists.
    global.db.get(
        `
        SELECT device_id
        FROM ESP32Devices
        WHERE device_id = ?
        `,
        [device_id],
        (err, device) => {
            if (err) return next(err);

            if (!device) {
                return res.status(404).send("Device not found");
            }

            // Update the network-device information.
            global.db.run(
                `
                UPDATE ESP32Devices
                SET
                    device_mac = ?,
                    ip_address = ?
                WHERE device_id = ?
                `,
                [
                    device_mac,
                    ip_address || null,
                    device_id
                ],
                function (err) {
                    if (err) {
                        if (err.code === "SQLITE_CONSTRAINT") {
                            return res.status(409).send(
                                "That MAC address is already registered."
                            );
                        }

                        return next(err);
                    }

                    // Update or create the station assignment.
                    global.db.run(
                        `
                        INSERT INTO ESP32Tagger (
                            device_id,
                            station_id
                        )
                        VALUES (?, ?)

                        ON CONFLICT(device_id)
                        DO UPDATE SET
                            station_id = excluded.station_id
                        `,
                        [
                            device_id,
                            station_id
                        ],
                        function (err) {
                            if (err) return next(err);

                            console.log(
                                `[UPDATE] Device ${device_id} updated: ` +
                                `${device_mac} → station ${station_id}`
                            );

                            res.redirect("/settings/esp32");
                        }
                    );
                }
            );
        }
    );
});

module.exports = router;