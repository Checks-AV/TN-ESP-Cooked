// Avan Here, Communications here!
// All ESP32 functions to be put HERE
// Use Javascript!

// PUT EVERYTHING COMMUNICATING TO HERE
// Then you just let your esp32 be the pretty hardware 

const express = require("express");
const router = express.Router();

// Registering a ESP32 into the database, ESP32 to communicate to the server here
router.post("/esp32/register", (req, res, next) => {
    const mac = req.body.mac;
    console.log(mac);

    if (!mac) {
        return res.status(400).json({
            success: false,
            message: "Missing MAC address"
        });
    }

    const ip = req.socket.remoteAddress.replace("::ffff:", "");
    const lastSeen = new Date().toISOString();

    console.log("ESP32 Registered:");
    console.log("MAC:", mac);
    console.log("IP:", ip);
    console.log("Last Seen:", lastSeen);

    const sql = `
        INSERT INTO ESP32Devices (device_mac, ip_address, last_seen)
        VALUES (?, ?, ?)
        ON CONFLICT(device_mac)
        DO UPDATE SET
            ip_address = excluded.ip_address,
            last_seen = excluded.last_seen
    `;

    global.db.run(sql, [mac, ip, lastSeen], function (err) {
        if (err) return next(err);

        res.json({
            success: true,
            mac,
            ip,
            last_seen: lastSeen
        });
    });
});


// Sending a message to a ESP32 with the located IP Addresses
router.post("/esp32/send", async (req, res, next) => {
    try {

        const { ip_address, message } = req.body;

        console.log("Sending to ESP32:");
        console.log("IP:", ip_address);
        console.log("Message:", message);

        const response = await fetch(`http://${ip_address}/cmd`, {
            method: "POST",
            headers: {
                "Content-Type": "text/plain"
            },
            body: message
        });

        const reply = await response.text();

        console.log("ESP32 replied:", reply);

        res.send("Message sent successfully");

    } catch (err) {
        next(err);
    }
});


module.exports = router;