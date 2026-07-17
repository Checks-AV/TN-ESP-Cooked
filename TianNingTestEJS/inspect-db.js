/**
 * inspect-db.js
 *
 * Prints the contents of the key tables so you can debug without the
 * sqlite3 command-line tool. Uses the same `sqlite3` npm package your
 * app already depends on.
 *
 * Run with:
 *   node inspect-db.js
 *
 * Edit DB_PATH below if your database.db lives somewhere else.
 */

const sqlite3 = require("sqlite3").verbose();
const DB_PATH = "./database.db";

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error("Failed to open database:", err.message);
        process.exit(1);
    }
});

const tables = [
    "ESP32Devices",
    "ESP32Tagger",
    "station",
    "station_preparation_method",
    "preparation_method",
    "RFIDTags",
    "ingredients",
    "Orders"
];

function printTable(name) {
    return new Promise((resolve) => {
        db.all(`SELECT * FROM ${name}`, [], (err, rows) => {
            console.log(`\n=== ${name} ===`);
            if (err) {
                console.log(`  ERROR: ${err.message}`);
            } else if (rows.length === 0) {
                console.log("  (empty)");
            } else {
                console.table(rows);
            }
            resolve();
        });
    });
}

async function run() {
    for (const t of tables) {
        await printTable(t);
    }
    db.close();
}

run();