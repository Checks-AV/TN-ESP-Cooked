/**
 * simulate-esp.js
 *
 * Simulates ESP32 devices talking to the Ticket Rail server, so you can
 * test the whole flow (register -> ping -> action -> reset -> submit ->
 * remote logging) without real hardware.
 *
 * Requires Node 18+ (built-in fetch). Run with:
 *   node public/simulate-esp.js
 *
 * Edit the CONFIG block below to match your setup (base URL, MACs,
 * station IDs, ingredient IDs, food_id, tag_rfids, action names).
 */

const CONFIG = {
    // Change this to match your server URL
    baseUrl: "http://localhost:4000",

    // Devices to simulate
    generalStation: {
        device_mac: "AA:BB:CC:DD:EE:01",
        station_id: 1,
        ip_address: "192.168.1.101"
    },
    counterStation: {
        device_mac: "AA:BB:CC:DD:EE:02",
        station_id: 2,
        ip_address: "192.168.1.102"
    },
    resetStation: {
        device_mac: "AA:BB:CC:DD:EE:03",
        station_id: 3,  // Make sure this matches your Reset station ID
        ip_address: "192.168.1.103"
    },

    // RFID tag(s) to simulate scanning, and what action to perform on each.
    // action_name can be a preparation_method_id (number) or name (string) -
    // both are supported by the server.
    tagActions: [
        { tag_rfid: "TAG-001", action_name: "Toast" },
        { tag_rfid: "TAG-002", action_name: "Slice" }
        // add more, e.g. { tag_rfid: "TAG-003", action_name: 2 }
    ],

    // Tag to reset (clears status back to 'Default')
    resetTag: "TAG-001",

    // Order to create + submit
    order_number: "01",       // raw 2-digit wire format
    food_id: 1,               // must exist in `food` table
    submitTagMacs: ["TAG-001", "TAG-002"], // tags the Counter ESP "scanned" at submission

    // Simulate a bad submission afterward, to exercise failure/edge-case
    // logging paths (missing tag, wrong order number, etc). Set to false
    // to skip.
    simulateFailureCase: true,

    // Delay between simulated device "events" in ms — sending everything
    // instantly doesn't look like real hardware. Set to 0 to disable.
    stepDelayMs: 250
};

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function post(path, body) {
    try {
        const res = await fetch(`${CONFIG.baseUrl}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        let data;
        try {
            data = await res.json();
        } catch (e) {
            data = { raw: await res.text() };
        }
        return { status: res.status, data };
    } catch (error) {
        console.error(`Network error when calling ${path}:`, error.message);
        return {
            status: 0,
            data: { error: "Network error", details: error.message }
        };
    }
}

function log(label, result) {
    console.log(`\n--- ${label} ---`);
    console.log(`Status: ${result.status}`);
    if (result.data && result.data.error) {
        console.log(`❌ Error: ${result.data.error}`);
        if (result.data.details) {
            console.log(`Details: ${result.data.details}`);
        }
    } else {
        console.log(JSON.stringify(result.data, null, 2));
    }
}

// Mirrors the ESP32 sketch's logMsg() — POSTs to /esp32comms/log so you
// can see this in /esp-monitor.html the same way a real device's remote
// logging would show up. Prefixed with 🛰️ in this script's own console
// output so you can tell "simulated device log" apart from the axios
// request/response logging that `log()` above prints.
async function deviceLog(device, level, message) {
    console.log(`🛰️  [${device.device_mac}] [${level}] ${message}`);
    return post("/esp32comms/log", {
        device_mac: device.device_mac,
        station_id: device.station_id,
        level,
        message,
        uptime_ms: Date.now() % 100000 // fake uptime, good enough for a sim
    });
}

async function ping(device, label) {
    log(
        `Ping (${label})`,
        await post("/esp32comms/listen", {
            device_mac: device.device_mac,
            message_type: "ping",
            payload: {}
        })
    );
}

async function step(fn) {
    await fn();
    if (CONFIG.stepDelayMs > 0) await sleep(CONFIG.stepDelayMs);
}

async function run() {
    console.log(`\n🚀 Simulating ESP32 traffic against ${CONFIG.baseUrl}`);
    console.log(`📡 Starting simulation at ${new Date().toLocaleTimeString()}\n`);

    // Check if server is running first
    try {
        const testRes = await fetch(CONFIG.baseUrl);
        if (!testRes.ok) {
            console.log(`⚠️ Server responded with status ${testRes.status}`);
        }
    } catch (error) {
        console.error(`❌ Server not reachable at ${CONFIG.baseUrl}`);
        console.log('Make sure your server is running with: node index.js');
        console.log('Also check that the port matches (currently configured for 4000)');
        process.exit(1);
    }

    // ─── BOOT: register every simulated device, like real ESP32s do on power-up ───
    await step(async () => {
        log("1. Register General station", await post("/esp32comms/register", CONFIG.generalStation));
        await deviceLog(CONFIG.generalStation, "info", "Booted and registered with server");
    });

    await step(async () => {
        log("2. Register Counter station", await post("/esp32comms/register", CONFIG.counterStation));
        await deviceLog(CONFIG.counterStation, "info", "Booted and registered with server");
    });

    await step(async () => {
        log("3. Register Reset station", await post("/esp32comms/register", CONFIG.resetStation));
        await deviceLog(CONFIG.resetStation, "info", "Booted and registered with server");
    });

    // ─── HEARTBEATS: every station pings, not just General ───
    await step(() => ping(CONFIG.generalStation, "General station"));
    await step(() => ping(CONFIG.counterStation, "Counter station"));
    await step(() => ping(CONFIG.resetStation, "Reset station"));

    // ─── PREP: General station scans tags and performs actions ───
    for (const ta of CONFIG.tagActions) {
        await step(async () => {
            await deviceLog(CONFIG.generalStation, "info", `Tag scanned: ${ta.tag_rfid}`);
            log(
                `Action: ${ta.tag_rfid} -> ${ta.action_name}`,
                await post("/esp32comms/listen", {
                    device_mac: CONFIG.generalStation.device_mac,
                    message_type: "action",
                    payload: ta
                })
            );
        });
    }

    // ─── RESET: Reset station clears a tag ───
    await step(async () => {
        await deviceLog(CONFIG.resetStation, "info", `Tag scanned for reset: ${CONFIG.resetTag}`);
        log(
            `Reset tag: ${CONFIG.resetTag}`,
            await post("/esp32comms/listen", {
                device_mac: CONFIG.resetStation.device_mac,
                message_type: "reset",
                payload: { tag_rfid: CONFIG.resetTag }
            })
        );
    });

    // ─── ORDER: game frontend creates the ticket ───
    await step(async () => {
        log(
            "Create order",
            await post("/api/orders", {
                order_number: CONFIG.order_number,
                food_id: CONFIG.food_id
            })
        );
    });

    // ─── SUBMIT: Counter ESP scans finished-ingredient tags and submits ───
    await step(async () => {
        for (const mac of CONFIG.submitTagMacs) {
            await deviceLog(CONFIG.counterStation, "info", `Tag added (${CONFIG.submitTagMacs.indexOf(mac) + 1}/${CONFIG.submitTagMacs.length}): ${mac}`);
        }
        await deviceLog(CONFIG.counterStation, "info", `Order number: ${CONFIG.order_number}`);
        await deviceLog(CONFIG.counterStation, "info", `Submitting order -> ${JSON.stringify({ order_number: CONFIG.order_number, tag_macs: CONFIG.submitTagMacs })}`);

        const result = await post("/api/esp/submit", {
            order_number: CONFIG.order_number,
            device_mac: CONFIG.counterStation.device_mac,
            tag_macs: CONFIG.submitTagMacs
        });
        log("Submit order (Counter station)", result);

        if (result.status === 200) {
            await deviceLog(CONFIG.counterStation, "info", "Order submitted successfully.");
        } else {
            await deviceLog(CONFIG.counterStation, "error", `Submit failed: HTTP ${result.status} | ${JSON.stringify(result.data)}`);
        }
    });

    // ─── OPTIONAL: a bad submission, to exercise error/logging paths ───
    if (CONFIG.simulateFailureCase) {
        await step(async () => {
            const badOrder = "99"; // shouldn't exist
            await deviceLog(CONFIG.counterStation, "warn", `Attempting submit with likely-invalid order number: ${badOrder}`);
            const result = await post("/api/esp/submit", {
                order_number: badOrder,
                device_mac: CONFIG.counterStation.device_mac,
                tag_macs: ["TAG-DOES-NOT-EXIST"]
            });
            log("Submit order (intentionally invalid, expect 404/409)", result);
            await deviceLog(CONFIG.counterStation, "error", `Submit failed as expected: HTTP ${result.status} | ${JSON.stringify(result.data)}`);
        });
    }

    console.log(`\n✅ Simulation completed at ${new Date().toLocaleTimeString()}`);
    console.log("Check your database, server console, and /esp-monitor.html for the results.\n");
}

// Run the simulation
run().catch((err) => {
    console.error("\n❌ Simulation failed with error:", err);
    process.exit(1);
});