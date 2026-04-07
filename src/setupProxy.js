const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function (app) {
  app.use(
    "/api/claude",
    createProxyMiddleware({
      target: "https://api.anthropic.com",
      changeOrigin: true,
      pathRewrite: { "^/api/claude": "/v1/messages" },
      onProxyReq: (proxyReq) => {
        const apiKey = process.env.ANTHROPIC_API_KEY || "";
        proxyReq.setHeader("x-api-key", apiKey);
        proxyReq.setHeader("anthropic-version", "2023-06-01");
      },
    })
  );
};
