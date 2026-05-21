# TN-ESP-Cooked
This is a personal project with CTN

For TN: please take note of the following files: 
All the files to communicate is inside routes/esp32comms.js
The setup has been done. 
Change the ESP32 code to "{ip_address}/esp32comms/{post_path}"

So if a post method looks like this: 
router.post("/esp32/register", ...

Your path would be "{ip_address}/esp32comms/esp32/register". Please update in your ESP32 before proceeding with any testing.