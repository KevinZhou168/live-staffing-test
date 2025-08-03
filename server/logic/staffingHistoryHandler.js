const fetchWithRetry = async (url, options, retries = 3, timeout = 50000) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
  
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
  
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          return await response.json();
        } else {
          return await response.text(); // Don't throw here
        }
      } catch (error) {
        if (attempt === retries) {
          throw error;
        }
        console.warn(`Fetch attempt ${attempt} failed. Retrying...`, error);
      }
    }
  };
  

const url = "https://script.google.com/macros/s/AKfycbwEsuHzdJKr3SCLJD1CznxwoqcTOHXbJSAjcwViyJyoJom3mfPaWgxpFnxnPuOAUN55VQ/exec"
async function postToGoogleSheet(data) {
    try {
        console.log("Posting to Google Sheet:", data);
        const response = await fetchWithRetry(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        }, 3, 30000);
        console.log("Google Sheet response:", response);
        return response;
    } catch (error) {
        console.error("Failed to post to Google Sheet:", error);
        throw error;
    }
}

module.exports = {
    postToGoogleSheet
};