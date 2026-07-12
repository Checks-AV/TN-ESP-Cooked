function updateESP32(deviceString)
{
    const device = JSON.parse(deviceString);

    fetch('/esp32/update', {
        method: 'POST',
        headers: {
            'Content-Type' : 'application/json'
        },
        body: JSON.stringify(device)
    }).then(response => response.json())
    .then(data => console.log('Success'))
    .catch(error=>console.error('Error: ', error));
}

// esp32setup.js

// Open the edit modal with device data
function openEditModal(deviceData) {
    let device;
    if (typeof deviceData === 'string') {
        try {
            device = JSON.parse(deviceData);
        } catch (e) {
            console.error('Error parsing device data:', e);
            return;
        }
    } else {
        device = deviceData;
    }
    
    // Populate the form fields
    document.getElementById('editDeviceId').value = device.esp32_id || '';
    document.getElementById('editMac').value = device.device_mac || '';
    document.getElementById('editIp').value = device.ip_address || '';
    document.getElementById('editType').value = device.device_type || '';
    
    // Show the modal
    document.getElementById('editModal').style.display = 'block';
}

// Close the edit modal
function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
}

// Keep your existing updateESP32 function for compatibility if needed
function updateESP32(deviceData) {
    // This function is kept for backward compatibility
    openEditModal(deviceData);
}

// Optional: Add function to test connection
function testConnection(ipAddress) {
    if (!ipAddress) {
        alert('No IP address available for this device');
        return;
    }
    
    fetch(`/esp32comms/test/${ipAddress}`)
        .then(response => response.json())
        .then(data => {
            alert(data.success ? 'Device is online!' : 'Device is offline or unreachable');
        })
        .catch(error => {
            alert('Error testing connection: ' + error.message);
        });
}