
// setup express, body parser and EJS 
const express = require('express');
const app = express();
const port = 4000;
var bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({ extended: true })); // parse the body before route handling happens
app.use(express.json()); // IMPORTANT for JSON bodies
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs'); // Tells Express to use EJS [11, 12]
app.use(express.static(__dirname + '/public')); // set location of static files


// SETUP SQLITE
const sqlite3 = require('sqlite3').verbose();
global.db = new sqlite3.Database('./database.db',function(err){
    if(err){
        console.error(err); // log error
        process.exit(1); // bail out when we can't connect to the DB, so wont have resource hogging or death here
    } else {
        console.log("Database connected");
        global.db.run("PRAGMA foreign_keys=ON"); // tell SQLite to pay attention to foreign key constraints
    }
});


// ROUTES HANDLERS BELOW <-- FOR ALL 
// Handle requests to the home page 
const appRoutes = require('./routes/main');
app.use('/', appRoutes);

const settingsRoutes = require('./routes/settings');
app.use('/settings', settingsRoutes);

const esp32Routes = require('./routes/esp32comms');
app.use('/esp32comms',esp32Routes);

const stagesRoutes = require('./routes/stages');
app.use('/stages', stagesRoutes);

app.use(express.text());
/* app.post('/', (req, res) => {

    console.log("========== ESP32 REQUEST ==========");
    console.log("Headers:");
    console.log(req.headers);

    console.log("Body:");
    console.log(req.body);

    console.log("IP Address:");
    console.log(req.ip);

    console.log("Raw Remote Address:");
    console.log(req.socket.remoteAddress);

    console.log("===================================");
    res.json({
        success: true
    });
});
*/


app.listen(port, () => console.log('Server running on port 4000'));

// app.use(express.json()); // IMPORTANT for JSON bodies

// app.post('/esp32-data', (req, res) => {

//     console.log("ESP32 Data Received:");
//     console.log(req.body);

//     res.json({
//         success: true
//     });
// });



// This is just for TianNing's ngrok thing for his other project (to remove)
/* app.listen(port, '0.0.0.0', () => {
    console.log('\n==================================================');
    console.log('🚀 nRF9160 GPS TRACKER RUNNING');
    console.log('==================================================');
    console.log(`📡 Local: http://localhost:${port}`);
    console.log('🌍 Public: http://unlit-dander-halt.ngrok-free.dev');
    console.log('==================================================\n');
});*/

