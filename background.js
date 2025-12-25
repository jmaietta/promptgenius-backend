// PromptGenius Background Service Worker
// Version 1.3.0 - Multi-version support

const BACKEND_URL = 'https://promptgenius-backend-e1h1.onrender.com';
const REQUEST_TIMEOUT = 30000;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'optimizePrompt') {
    optimizeWithBackend(request.prompt)
      .then(result => {
        sendResponse({ success: true, versions: result.versions });
      })
      .catch(error => {
        console.error('PromptGenius:', error.message);
        sendResponse({ success: false, error: error.message });
      });

    return true;
  }
});

async function optimizeWithBackend(prompt) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(`${BACKEND_URL}/api/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMessage = `Server error: ${response.status}`;

      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        // Use default message
      }

      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please wait a moment.');
      } else if (response.status === 503 || response.status === 502) {
        throw new Error('Service starting up. Please retry in a few seconds.');
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();

    if (!data.success || !data.versions) {
      throw new Error('Invalid response from server');
    }

    return { versions: data.versions };

  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }

    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      throw new Error('Cannot reach server. Check your connection.');
    }

    throw error;
  }
}
