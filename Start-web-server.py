from http.server import HTTPServer, SimpleHTTPRequestHandler
import os

# Define server address and port
HOST = "localhost"
PORT = 8000

def run_server():
    # Serve the current directory
    directory = os.path.abspath(os.path.dirname(__file__))
    os.chdir(directory)

    server = HTTPServer((HOST, PORT), SimpleHTTPRequestHandler)
    print(f"Serving {directory} at http://{HOST}:{PORT}/")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.server_close()

if __name__ == "__main__":
    run_server()
