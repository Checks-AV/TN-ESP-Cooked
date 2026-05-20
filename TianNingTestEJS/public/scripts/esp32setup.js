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