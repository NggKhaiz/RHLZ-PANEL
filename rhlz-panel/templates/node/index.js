// Node.js Application on RHLZ Panel
const http = require("http");
const port = process.env.PORT || process.env.SERVER_PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "online", runtime: "node.js", time: new Date().toISOString() }));
});
server.listen(port, "0.0.0.0", () => {
  console.log("[Server] Listening on http://0.0.0.0:" + port);
});
