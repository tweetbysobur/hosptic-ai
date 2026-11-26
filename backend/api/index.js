// Entry point for serverless hosting such as Vercel, which expects the module's default export
// to be the request handler. Local and long-running servers keep using src/server.js.
const { createApp } = require("../src/app");

module.exports = createApp();
