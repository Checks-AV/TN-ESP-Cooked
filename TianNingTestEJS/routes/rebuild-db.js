const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const dbPath = 'database.db';
const schemaPath = 'db_schema.sql';

// Check if schema file exists
if (!fs.existsSync(schemaPath)) {
    console.error('❌ Schema file not found:', schemaPath);
    process.exit(1);
}

console.log('📖 Building database from schema...');
const schema = fs.readFileSync(schemaPath, 'utf8');
const db = new sqlite3.Database(dbPath);

db.exec(schema, (err) => {
    if (err) {
        console.error('❌ Build Error:', err.message);
        db.close();
        process.exit(1);
    } else {
        console.log('✅ Database built successfully!');
        console.log(`📁 Database file: ${dbPath}`);
        
        // Show tables created
        db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", (err, tables) => {
            if (!err && tables.length > 0) {
                console.log('📊 Tables created:', tables.map(t => t.name).join(', '));
            } else if (!err) {
                console.log('⚠️ No tables were created (check your schema)');
            }
            db.close();
        });
    }
});