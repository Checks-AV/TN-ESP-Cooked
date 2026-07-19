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

                    // If no station_id was given, default to the "General"
                    // station by name — so an ESP32 can self-register with
                    // zero manual setup on first boot. It only ever needs to
                    // send station_id if you want it explicitly at Counter
                    // (or a future non-default station).
                    function assignStation(resolvedStationId) {
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
                                resolvedStationId
                            ],
                            function (err) {
                                if (err) return next(err);

                                console.log(
                                    `[REGISTER] ${device_mac} | ` +
                                    `station: ${resolvedStationId} | ` +
                                    `ip: ${ip_address || "N/A"}`
                                );

                                return res.json({
                                    success: true,
                                    message: "ESP32 registered successfully",
                                    device_id: device.device_id,
                                    device_mac,
                                    station_id: resolvedStationId,
                                    auto_assigned: !station_id
                                });
                            }
                        );
                    }

                    if (station_id) {
                        assignStation(station_id);
                    } else {
                        global.db.get(
                            `SELECT station_id FROM station WHERE station_name = 'General'`,
                            [],
                            (err, generalStation) => {
                                if (err) return next(err);
                                if (!generalStation) {
                                    return res.status(500).json({
                                        success: false,
                                        error: "No station_id provided and no 'General' station exists to default to"
                                    });
                                }
                                assignStation(generalStation.station_id);
                            }
                        );
                    }
                }
            );
        }
    );
});

// ─── POST /esp32comms/log ─────────────────────────────────────
// Remote logging endpoint — the Counter ESP32's logMsg() posts here so
// you can see its activity without a serial cable plugged in.
// Body: { device_mac, station_id, level, message, uptime_ms }
//
// esplisten.js already watches everything under /esp32comms, so once
// this route exists, every call here is automatically captured into
// its history buffer and pushed live to /api/esp-monitor/stream —
// nothing else needs to change for it to show up on /esp-monitor.html.
router.post("/log", (req, res) => {
    const { device_mac, station_id, level, message, uptime_ms } = req.body;

    if (!device_mac || !message) {
        return res.status(400).json({
            success: false,
            error: "Missing device_mac or message"
        });
    }

    const safeLevel = level || "info";
    const uptimeSec = typeof uptime_ms === "number" ? (uptime_ms / 1000).toFixed(1) : "?";

    console.log(
        `[ESP-LOG] ${device_mac} (station ${station_id ?? "?"}) ` +
        `[${safeLevel}] +${uptimeSec}s | ${message}`
    );

    res.json({ success: true });
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
//   "reset"   → payload: { tag_rfid }
//               the "Reset" station reports a tag was scanned to be
//               manually cleared — server sets that tag's
//               current_status back to 'Default'
//   "submit"  → handled separately via /api/esp/submit in ticketrail.js
//   "ping"    → payload: {} (just a heartbeat, updates last_seen)
//
router.post("/listen", (req, res, next) => {
    const { device_mac, message_type, payload } = req.body;

    if (!device_mac || !message_type) {
        return res.status(400).json({ error: "Missing device_mac or message_type" });
    }

    const now = new Date().toISOString();

    // First, ensure the device exists in the database
    // If it doesn't exist, create it with default "General" station
    global.db.get(
        `SELECT device_id FROM ESP32Devices WHERE device_mac = ?`,
        [device_mac],
        (err, existingDevice) => {
            if (err) return next(err);

            if (!existingDevice) {
                // Device doesn't exist - auto-register it
                console.log(`[LISTEN] Auto-registering new device: ${device_mac}`);
                
                global.db.run(
                    `INSERT INTO ESP32Devices (device_mac, ip_address, last_seen)
                     VALUES (?, ?, ?)`,
                    [device_mac, null, now],
                    function(err) {
                        if (err) return next(err);
                        
                        // Get the new device_id
                        global.db.get(
                            `SELECT device_id FROM ESP32Devices WHERE device_mac = ?`,
                            [device_mac],
                            (err, newDevice) => {
                                if (err) return next(err);
                                if (!newDevice) {
                                    return res.status(500).json({ error: "Failed to create device" });
                                }
                                
                                // Assign to "General" station by default
                                global.db.get(
                                    `SELECT station_id FROM station WHERE station_name = 'General'`,
                                    [],
                                    (err, generalStation) => {
                                        if (err) return next(err);
                                        
                                        if (generalStation) {
                                            global.db.run(
                                                `INSERT INTO ESP32Tagger (device_id, station_id)
                                                 VALUES (?, ?)`,
                                                [newDevice.device_id, generalStation.station_id],
                                                function(err) {
                                                    if (err) return next(err);
                                                    console.log(`[LISTEN] Auto-assigned ${device_mac} to General station`);
                                                    processMessage();
                                                }
                                            );
                                        } else {
                                            console.log(`[LISTEN] No General station found for auto-assignment`);
                                            processMessage();
                                        }
                                    }
                                );
                            }
                        );
                    }
                );
            } else {
                // Device exists, just update last_seen
                global.db.run(
                    `UPDATE ESP32Devices SET last_seen = ? WHERE device_mac = ?`,
                    [now, device_mac],
                    (err) => {
                        if (err) return next(err);
                        processMessage();
                    }
                );
            }
        }
    );

    function processMessage() {
        console.log(`[LISTEN] ${device_mac} | ${message_type} | ${JSON.stringify(payload)}`);

        if (message_type === "ping") {
            return res.json({ success: true, message: "pong" });
        }

        if (message_type === "action") {
            return handleAction(req, res, next, device_mac, payload);
        }

        if (message_type === "reset") {
            return handleResetTag(req, res, next, device_mac, payload);
        }

        return res.status(400).json({ error: `Unknown message_type: ${message_type}` });
    }
});

// ─── INTERNAL: handle action ──────────────────────────────────
// device_mac: the STATION's ESP32 MAC (not the tag — tags are passive RFID)
// payload: { tag_rfid, action_name }
// action_name may be EITHER:
//   - a preparation_method_id (number, e.g. 2)
//   - a preparation_method_name (string, e.g. "Cook")
// Either way, the canonical name is resolved and stored in the chain,
// so RFIDTags.current_status always matches the string format the
// recipe validator (ticketrail.js) expects.
function handleAction(req, res, next, device_mac, payload) {
    const { tag_rfid, action_name } = payload || {};

    if (!tag_rfid || action_name === undefined || action_name === null || action_name === '') {
        return res.status(400).json({ error: "action needs tag_rfid and action_name in payload" });
    }

    // Resolve action_name to a canonical preparation_method row,
    // whether it arrived as an id or a name.
    const isNumeric = /^\d+$/.test(String(action_name).trim());
    const methodLookupSql = isNumeric
        ? `SELECT preparation_method_id, preparation_method_name FROM preparation_method WHERE preparation_method_id = ?`
        : `SELECT preparation_method_id, preparation_method_name FROM preparation_method WHERE preparation_method_name = ?`;
    const methodLookupParam = isNumeric ? Number(action_name) : String(action_name).trim();

    global.db.get(methodLookupSql, [methodLookupParam], (err, method) => {
        if (err) return next(err);
        if (!method) {
            return res.status(400).json({
                error: `Unknown preparation method: "${action_name}"`
            });
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

                // Counter only submits finished orders (/api/esp/submit),
                // and Reset only clears a single tag's status (message_type
                // "reset") — neither ever performs prep actions on tags.
                if (station.station_name === 'Counter') {
                    return res.status(403).json({
                        error: `Station "Counter" cannot perform prep actions. ` +
                               `Counter only submits finished orders via /api/esp/submit.`
                    });
                }
                if (station.station_name === 'Reset') {
                    return res.status(403).json({
                        error: `Station "Reset" cannot perform prep actions. ` +
                               `Reset only clears tag status via message_type "reset".`
                    });
                }

                // 2. Confirm this station is allowed to perform this preparation method
                global.db.get(
                    `SELECT preparation_method_id
                     FROM station_preparation_method
                     WHERE station_id = ? AND preparation_method_id = ?`,
                    [station.station_id, method.preparation_method_id],
                    (err, allowed) => {
                        if (err) return next(err);
                        if (!allowed) {
                            return res.status(403).json({
                                error: `Station "${station.station_name}" cannot perform "${method.preparation_method_name}"`
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

                                // 4. Append the resolved method name to the status chain
                                const base = (!tag.current_status || tag.current_status === '1')
                                    ? 'Default'
                                    : tag.current_status;
                                const newStatus = `${base} → ${method.preparation_method_name}`;

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
                                            action: method.preparation_method_name,
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
    });
}

// ─── INTERNAL: handle reset ────────────────────────────────────
// device_mac: the "Reset" station's ESP32 MAC
// payload: { tag_rfid }
//
// Clears a single tag's current_status back to 'Default', independent
// of any order. This is a manual/utility action — separate from the
// automatic reset-all-tags that happens after every order submit
// (pass or fail) in ticketrail.js.
function handleResetTag(req, res, next, device_mac, payload) {
    const { tag_rfid } = payload || {};

    if (!tag_rfid) {
        return res.status(400).json({ error: "reset needs tag_rfid in payload" });
    }

    // Find which station this ESP32 is assigned to, and confirm it's
    // actually the "Reset" station — this message type has one job.
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

            if (station.station_name !== 'Reset') {
                return res.status(403).json({
                    error: `Station "${station.station_name}" cannot send reset messages. ` +
                           `Only the "Reset" station can clear a tag's status this way.`
                });
            }

            global.db.get(
                `SELECT tag_id, current_status FROM RFIDTags WHERE tag_rfid = ?`,
                [tag_rfid],
                (err, tag) => {
                    if (err) return next(err);
                    if (!tag) {
                        return res.status(404).json({
                            error: `Tag ${tag_rfid} is not assigned to any ingredient`
                        });
                    }

                    global.db.run(
                        `UPDATE RFIDTags SET current_status = 'Default' WHERE tag_id = ?`,
                        [tag.tag_id],
                        function (err) {
                            if (err) return next(err);

                            console.log(
                                `[RESET] Tag ${tag_rfid} cleared: ` +
                                `"${tag.current_status}" → "Default"`
                            );

                            res.json({
                                success: true,
                                tag_rfid,
                                previous_status: tag.current_status,
                                new_status: 'Default'
                            });
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

// ─── POST /esp32comms/reset ────────────────────────────────────
// Reset a single tag's status back to 'Default'
router.post("/reset", (req, res, next) => {
    const { tag_rfid } = req.body;

    if (!tag_rfid) {
        return res.status(400).json({
            success: false,
            error: "Missing tag_rfid"
        });
    }

    global.db.get(
        `SELECT tag_id, current_status FROM RFIDTags WHERE tag_rfid = ?`,
        [tag_rfid],
        (err, tag) => {
            if (err) return next(err);
            if (!tag) {
                return res.status(404).json({
                    success: false,
                    error: `Tag ${tag_rfid} not found`
                });
            }

            global.db.run(
                `UPDATE RFIDTags SET current_status = 'Default' WHERE tag_id = ?`,
                [tag.tag_id],
                function (err) {
                    if (err) return next(err);

                    console.log(
                        `[RESET] Tag ${tag_rfid} reset: ` +
                        `"${tag.current_status}" → "Default"`
                    );

                    res.json({
                        success: true,
                        message: "Tag reset to Default",
                        tag_rfid,
                        previous_status: tag.current_status,
                        new_status: 'Default'
                    });
                }
            );
        }
    );
});

// ─── DELETE /esp32comms/device/:device_id ────────────────────
// Remove an ESP32 device and its tagger assignment
router.delete("/device/:device_id", (req, res, next) => {
    const { device_id } = req.params;

    if (!device_id) {
        return res.status(400).json({
            success: false,
            error: "Missing device_id"
        });
    }

    // Start a transaction to ensure both deletes succeed or fail together
    global.db.serialize(() => {
        global.db.run("BEGIN TRANSACTION");

        // First delete from ESP32Tagger (foreign key constraint)
        global.db.run(
            `DELETE FROM ESP32Tagger WHERE device_id = ?`,
            [device_id],
            (err) => {
                if (err) {
                    global.db.run("ROLLBACK");
                    return next(err);
                }

                // Then delete from ESP32Devices
                global.db.run(
                    `DELETE FROM ESP32Devices WHERE device_id = ?`,
                    [device_id],
                    function (err) {
                        if (err) {
                            global.db.run("ROLLBACK");
                            return next(err);
                        }

                        if (this.changes === 0) {
                            global.db.run("ROLLBACK");
                            return res.status(404).json({
                                success: false,
                                error: "Device not found"
                            });
                        }

                        global.db.run("COMMIT");
                        console.log(`[DELETE] Device ${device_id} removed`);
                        
                        res.json({
                            success: true,
                            message: "Device removed successfully",
                            device_id
                        });
                    }
                );
            }
        );
    });
});

// ─── POST /esp32comms/delete-tag-assignment ──────────────────
// Remove a tag assignment
router.post("/delete-tag-assignment", (req, res, next) => {
    const { tag_id } = req.body;

    if (!tag_id) {
        return res.status(400).json({
            success: false,
            error: "Missing tag_id"
        });
    }

    global.db.run(
        `DELETE FROM RFIDTags WHERE tag_id = ?`,
        [tag_id],
        function (err) {
            if (err) return next(err);

            if (this.changes === 0) {
                return res.status(404).json({
                    success: false,
                    error: "Tag assignment not found"
                });
            }

            console.log(`[DELETE-TAG] Tag assignment ${tag_id} removed`);
            res.json({
                success: true,
                message: "Tag assignment removed successfully"
            });
        }
    );
});

// ─── POST /esp32comms/update-tag-assignment ──────────────────
// Update a tag assignment
router.post("/update-tag-assignment", (req, res, next) => {
    const { tag_id, tag_rfid, ingredients_id } = req.body;

    if (!tag_id || !tag_rfid || !ingredients_id) {
        return res.status(400).json({
            success: false,
            error: "Missing required fields"
        });
    }

    global.db.run(
        `UPDATE RFIDTags 
         SET tag_rfid = ?, ingredients_id = ?, current_status = 'Default'
         WHERE tag_id = ?`,
        [tag_rfid, ingredients_id, tag_id],
        function (err) {
            if (err) {
                if (err.code === "SQLITE_CONSTRAINT") {
                    return res.status(409).json({
                        success: false,
                        error: "That RFID tag is already assigned"
                    });
                }
                return next(err);
            }

            if (this.changes === 0) {
                return res.status(404).json({
                    success: false,
                    error: "Tag assignment not found"
                });
            }

            console.log(`[UPDATE-TAG] Tag assignment ${tag_id} updated`);
            res.json({
                success: true,
                message: "Tag assignment updated successfully"
            });
        }
    );
});

module.exports = router;