/**
 * simulate-esp.js
 *
 * Simulates ESP32 devices talking to the Ticket Rail server, so you can
 * test the whole flow (register -> action -> submit) without real hardware.
 *
 * Requires Node 18+ (built-in fetch). Run with:
 *   node public/simulate-esp.js
 *
 * Edit the CONFIG block below to match your setup (base URL, MACs,
 * station IDs, ingredient IDs, food_id, tag_rfids, action names).
 */

const CONFIG = {
    // Change this to match your server URL
    baseUrl: "http://localhost:4000", // Changed from 3000 to 4000 to match your server port

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

    // RFID tag(s) to simulate scanning, and what action to perform on each.
    // action_name can be a preparation_method_id (number) or name (string) -
    // both are supported by the server.
    tagActions: [
        { tag_rfid: "TAG-001", action_name: "Toast" }
        // add more, e.g. { tag_rfid: "TAG-002", action_name: 2 }
    ],

    // Order to create + submit
    order_number: "01",       // raw 2-digit wire format
    food_id: 1,                // must exist in `food` table
    submitTagMacs: ["TAG-001"] // tags the Counter ESP "scanned" at submission
};

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

    // 1. Register the General station device
    log(
        "1. Register General station",
        await post("/esp32comms/register", CONFIG.generalStation)
    );

    // 2. Register the Counter station device
    log(
        "2. Register Counter station",
        await post("/esp32comms/register", CONFIG.counterStation)
    );

    // 3. Heartbeat ping from General station
    log(
        "3. Ping (General station)",
        await post("/esp32comms/listen", {
            device_mac: CONFIG.generalStation.device_mac,
            message_type: "ping",
            payload: {}
        })
    );

    // 4. Create an order (mimics the game frontend registering a spawned ticket)
    log(
        "4. Create order",
        await post("/api/orders", {
            order_number: CONFIG.order_number,
            food_id: CONFIG.food_id
        })
    );

    // 5. Simulate the General station performing actions on tags
    for (const ta of CONFIG.tagActions) {
        log(
            `5. Action: ${ta.tag_rfid} -> ${ta.action_name}`,
            await post("/esp32comms/listen", {
                device_mac: CONFIG.generalStation.device_mac,
                message_type: "action",
                payload: ta
            })
        );
    }

    // 6. Counter ESP submits the order
    log(
        "6. Submit order (Counter station)",
        await post("/api/esp/submit", {
            order_number: CONFIG.order_number,
            device_mac: CONFIG.counterStation.device_mac,
            tag_macs: CONFIG.submitTagMacs
        })
    );

    console.log(`\n✅ Simulation completed at ${new Date().toLocaleTimeString()}`);
    console.log("Check your database and server logs for the results.\n");
}

// Run the simulation
run().catch((err) => {
    console.error("\n❌ Simulation failed with error:", err);
    process.exit(1);
});