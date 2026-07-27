const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const dbPath = path.join(projectRoot, 'database.db');
const schemaPath = path.join(projectRoot, 'db_schema.sql');
const recipesPath = path.join(projectRoot, 'recipe.sqlite3-query');
const newTagsPath = path.join(projectRoot, 'add_new_rfid_tags.sqlite3-query'); // <-- new separate file

if (!fs.existsSync(schemaPath)) {
    console.error('❌ Schema file not found:', schemaPath);
    process.exit(1);
}

console.log('📖 Building database...');

// Delete existing database
if (fs.existsSync(dbPath)) {
    console.log('🗑️ Removing existing database...');
    fs.unlinkSync(dbPath);
}

// Combine schema, recipes, and new tags
let sql = fs.readFileSync(schemaPath, 'utf8');

if (fs.existsSync(recipesPath)) {
    console.log('📖 Found recipes file, including it...');
    const recipes = fs.readFileSync(recipesPath, 'utf8');
    sql += '\n' + recipes;
} else {
    console.warn('⚠️ Recipe file not found, skipping...');
}

if (fs.existsSync(newTagsPath)) {
    console.log('📖 Found new RFID tags file, including it...');
    const newTags = fs.readFileSync(newTagsPath, 'utf8');
    sql += '\n' + newTags;
} else {
    console.warn('⚠️ New RFID tags file not found, skipping...');
}

const db = new sqlite3.Database(dbPath);

db.exec(sql, (err) => {
    if (err) {
        console.error('❌ Build Error:', err.message);
        db.close();
        process.exit(1);
    } else {
        console.log('✅ Database built successfully!');

        // Show summary
        db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", (err, tables) => {
            if (!err && tables.length > 0) {
                console.log('📊 Tables:', tables.map(t => t.name).join(', '));
            }

            db.all("SELECT food_name FROM food ORDER BY food_id", (err, foods) => {
                if (!err && foods && foods.length > 0) {
                    console.log('🍽️ Food items:', foods.map(f => f.food_name).join(', '));
                } else if (!err) {
                    console.log('⚠️ No food items found');
                }

                db.all("SELECT COUNT(*) AS count FROM RFIDTags", (err, rfidCount) => {
                    if (!err && rfidCount) {
                        console.log('🏷️ RFID tags in database:', rfidCount[0].count);
                    }
                    db.close();
                    console.log('✅ Rebuild complete!');
                });
            });
        });
    }
});