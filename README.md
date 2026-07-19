# TN-ESP-Cooked
This is a personal project with CTN

For TN: please take note of the following files: 
All the files to communicate is inside routes/esp32comms.js
The setup has been done. 
Change the ESP32 code to "{ip_address}/esp32comms/{post_path}"

So if a post method looks like this: 
router.post("/esp32/register", ...

Your path would be "{ip_address}/esp32comms/esp32/register". Please update in your ESP32 before proceeding with any testing.

# Get all recipes (food items)
curl http://localhost:3000/api/recipes

# Create an order
curl -X POST http://localhost:3000/api/orders/create \
  -H "Content-Type: application/json" \
  -d '{"food_id":1,"order_number":"K-001"}'

# Register ESP32
curl -X POST http://localhost:3000/api/esp/register \
  -H "Content-Type: application/json" \
  -d '{"device_mac":"AA:BB:CC:DD:EE:01","device_type":"tag","ip_address":"192.168.1.101"}'

# ESP32 sends action
curl -X POST http://localhost:3000/api/esp/action \
  -H "Content-Type: application/json" \
  -d '{"tag_mac":"AA:BB:CC:DD:EE:01","action_name":"Toast","order_number":"K-001"}'

# Get pending orders
curl http://localhost:3000/api/orders/pending

# Get game state
curl http://localhost:3000/api/game/state

# Test if API is working
curl http://localhost:3000/api/test

# Get all recipes
curl http://localhost:3000/api/recipes

# Get specific recipe
curl http://localhost:3000/api/recipes/1

# Get ingredients
curl http://localhost:3000/api/ingredients

# Get stations
curl http://localhost:3000/api/stations


{
  type: 'esp-order',
  payload: {
    order_number: "01",
    device_mac: "AA:BB:CC:DD:EE:FF",
    tag_macs: ["11:22:33:44:55:66", "77:88:99:AA:BB:CC", "DD:EE:FF:00:11:22"]
  }
}
{
  type: 'esp-order',
  payload: {
    order_number: "01",
    device_mac: "AA:BB:CC:DD:EE:FF",
    device_type: "counter",  // Required for validation
    tag_macs: ["11:22:33:44:55:66", "77:88:99:AA:BB:CC", "DD:EE:FF:00:11:22"]
  }
}

http://localhost:4000/esp-monitor.html
http://localhost:4000/esp-test-console.html
node inspect-db.js
cd C:\Users\CTN\Documents\GitHub\TN-ESP-Cooked\TianNingTestEJS
npm start

npm run clean-db
npm run build-db