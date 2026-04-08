module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  console.log("[claude] apiKey exists:", !!apiKey, "length:", apiKey?.length);
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set" });
  }

  // req.body が文字列で来る場合もパースする
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const { model, max_tokens, messages } = body || {};

  // 必須パラメータの検証
  if (!model || !max_tokens || !Array.isArray(messages) || messages.length === 0) {
    console.error("[claude] invalid body:", JSON.stringify(body));
    return res.status(400).json({ error: "model, max_tokens, messages are required" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model, max_tokens, messages }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[claude] Anthropic error:", response.status, JSON.stringify(data));
    }

    return res.status(response.status).json(data);
  } catch (err) {
    console.error("[claude] fetch error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
