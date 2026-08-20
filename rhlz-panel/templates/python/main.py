# Python Application on RHLZ Panel
import os, sys
from http.server import HTTPServer, BaseHTTPRequestHandler

port = int(os.environ.get("SERVER_PORT", os.environ.get("PORT", 8000)))

class RequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status": "online", "runtime": "python"}')
    def log_message(self, format, *args):
        print("[%s] %s" % (self.log_date_time_string(), format % args), flush=True)

server = HTTPServer(("0.0.0.0", port), RequestHandler)
print("[Server] Listening on http://0.0.0.0:%s" % port, flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    server.server_close()
