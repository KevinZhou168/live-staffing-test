const url = "https://script.google.com/macros/s/AKfycbwae3VAxJf8dBB-Rg1v4sOZwQAHihAbJ5GNV13jPBQZUBXffSS058X3Em7QwpG5ZUpYXQ/exec";

async function postToGoogleSheet(data) {
    try {
        console.log('Posting to Google Sheet:', data);
        const response = await fetch(url, {
            method: 'POST',
            body: JSON.stringify(data),
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const result = await response.text();
        console.log('Success:', result);
    } catch (error) {
        console.error('Error:', error);
    }
}

module.exports = {
    postToGoogleSheet
};
