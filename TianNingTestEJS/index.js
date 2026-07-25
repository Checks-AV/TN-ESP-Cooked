// setup express, body parser and EJS 
const express = require('express');
const path = require('path');
const app = express();
const port = 4000;
var bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

// SETUP SQLITE
const sqlite3 = require('sqlite3').verbose();
global.db = new sqlite3.Database('./database.db', function(err){
    if(err){
        console.error(err);
        process.exit(1);
    } else {
        console.log("✅ Database connected");
        global.db.run("PRAGMA foreign_keys=ON");
    }
});

// ROUTES HANDLERS
// Handle requests to the home page 
const appRoutes = require('./routes/main');
app.use('/', appRoutes);

const settingsRoutes = require('./routes/settings');
app.use('/settings', settingsRoutes);

// esplisten MUST be mounted before esp32comms/ticketrail
const esplistenRoutes = require('./routes/esplisten');
app.use(esplistenRoutes);

const esp32Routes = require('./routes/esp32comms');
app.use('/esp32comms', esp32Routes);

// Ticketrail routes - handles /game, /game/settings, /api/*, /leaderboards, etc.
const ticketrailRoutes = require('./routes/ticketrail');
app.use(ticketrailRoutes);

app.use(express.text());

app.listen(port, () => {
    console.log('\n==================================================');
    console.log('🚀 OVERCOOKED TICKET RAIL SERVER');
    console.log('==================================================');
    console.log(`📡 Server running on http://localhost:${port}`);
    console.log(`🎮 Game: http://localhost:${port}/game`);
    console.log(`🎛 Control: http://localhost:${port}/game/settings`);
    console.log(`🏆 Leaderboard: http://localhost:${port}/leaderboards`);
    console.log(`📊 ESP Dashboard: http://localhost:${port}/espdashboard`);
    console.log(`👨‍🍳 Credits: http://localhost:${port}/credits`);
    console.log('==================================================\n');
});