async function parseResponse(response) {
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;

    try {
      const json = await response.json();
      message = json.error || message;
    } catch {
      // Ignore JSON parse errors and keep status text.
    }

    throw new Error(message);
  }

  return response.json();
}

export async function getJson(url) {
  const response = await fetch(url);
  return parseResponse(response);
}

export async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}

export async function uploadImage(url, file) {
  const formData = new FormData();
  formData.append("image", file);

  const response = await fetch(url, {
    method: "POST",
    body: formData,
  });

  return parseResponse(response);
}
