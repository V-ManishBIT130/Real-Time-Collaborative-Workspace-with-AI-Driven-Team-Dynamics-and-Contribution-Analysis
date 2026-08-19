import urllib.request
import json
import sys

services = {
    "ML Service (port 5000)": "http://localhost:5000/health",
    "Backend (port 3001)": "http://localhost:3001/api/health",
    "Frontend (port 5173)": "http://localhost:5173",
}

for name, url in services.items():
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = resp.read().decode('utf-8')
            print(f"[OK] {name}")
            if url.endswith('/health'):
                data = json.loads(body)
                print(f"     {json.dumps(data, indent=2)}")
    except Exception as e:
        print(f"[FAIL] {name}: {e}")
