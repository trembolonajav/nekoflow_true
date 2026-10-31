"""Adaptador local autorizado para o TiaManhwa usando a pilha TLS do Windows."""

from __future__ import annotations

import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urljoin, urlparse


ORIGIN = "https://tiamanhwa.com"
PORT = int(os.environ.get("TIA_FETCHER_PORT", "19091"))
SECRET = os.environ.get("TIA_FETCHER_SECRET", "dev-only-tia-fetcher-secret")
MAX_BYTES = 8 * 1024 * 1024
ROOT = Path(__file__).resolve().parents[1]
RUNTIME_DIR = ROOT / "runtime"
RUNTIME_DIR.mkdir(exist_ok=True)
COOKIE_JAR = RUNTIME_DIR / "tia-fetcher-cookies.txt"
fetch_lock = threading.Lock()
last_fetch_at = 0.0

logger = logging.getLogger("nekoflow.tia-fetcher")
logger.setLevel(logging.INFO)
handler = RotatingFileHandler(RUNTIME_DIR / "tia-fetcher.log", maxBytes=1_000_000, backupCount=3, encoding="utf-8")
handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
logger.addHandler(handler)


def safe_path(value: str) -> bool:
    if not value or len(value) > 2048 or not value.startswith("/") or value.startswith("//"):
        return False
    if "\\" in value or "\r" in value or "\n" in value:
        return False
    parsed = urlparse(urljoin(ORIGIN, value))
    return parsed.scheme == "https" and parsed.hostname == "tiamanhwa.com"


def reply(handler: BaseHTTPRequestHandler, status: int, body: bytes, content_type: str) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


class Handler(BaseHTTPRequestHandler):
    server_version = "NekoFlowTiaAdapter/1.0"

    def log_message(self, fmt: str, *args: object) -> None:
        logger.info("%s - %s", self.client_address[0], fmt % args)

    def do_GET(self) -> None:  # noqa: N802
        address = urlparse(self.path)
        if address.path == "/health":
            return reply(self, 200, b'{"status":"UP"}', "application/json")
        if address.path != "/fetch" or self.headers.get("X-Nekoflow-Internal") != SECRET:
            return reply(self, 404, b'{"error":"not_found"}', "application/json")

        path = parse_qs(address.query).get("path", [""])[0]
        if not safe_path(path):
            return reply(self, 400, b'{"error":"invalid_path"}', "application/json")

        target = urljoin(ORIGIN, path)
        output_path = ""
        try:
            with tempfile.NamedTemporaryFile(prefix="nekoflow-tia-", suffix=".html", delete=False) as output:
                output_path = output.name
            global last_fetch_at
            with fetch_lock:
                # A origem parceira aplica uma janela muito conservadora (aprox. 3 páginas/minuto).
                # Serializamos abaixo desse limite para evitar 403 sem perder itens do catálogo.
                wait = 22.0 - (time.monotonic() - last_fetch_at)
                if wait > 0:
                    time.sleep(wait)
                for attempt in range(3):
                    command = [
                        r"C:\Windows\System32\curl.exe",
                        "--silent", "--show-error", "--location", "--max-redirs", "3",
                        "--proto", "=https", "--proto-redir", "=https",
                        "--connect-timeout", "10", "--max-time", "40",
                        "--max-filesize", str(MAX_BYTES), "--compressed",
                        "--header", "Accept-Language: pt-BR,pt;q=0.9,en;q=0.8",
                        "--cookie", f"{COOKIE_JAR};tia_idade_confirmada=1",
                        "--cookie-jar", str(COOKIE_JAR),
                        "--output", output_path,
                        "--write-out", "%{url_effective}\n%{http_code}",
                        target,
                    ]
                    result = subprocess.run(
                        command, check=False, capture_output=True, text=True, timeout=45,
                        creationflags=subprocess.CREATE_NO_WINDOW,
                    )
                    last_fetch_at = time.monotonic()
                    metadata = result.stdout.strip().splitlines()
                    effective = urlparse(metadata[-2] if len(metadata) >= 2 else "")
                    status = int(metadata[-1]) if metadata and metadata[-1].isdigit() else 0
                    if result.returncode == 0 and status == 200:
                        break
                    if status in (403, 429) and attempt < 2:
                        time.sleep(75 * (attempt + 1))
                        continue
                    raise RuntimeError(f"curl={result.returncode} upstream={status}")
            if effective.scheme != "https" or effective.hostname != "tiamanhwa.com":
                raise RuntimeError("redirect_rejected")
            body = Path(output_path).read_bytes()
            if len(body) > MAX_BYTES:
                raise RuntimeError("response_too_large")
            return reply(self, 200, body, "text/html; charset=utf-8")
        except Exception as error:  # response deliberately hides upstream details
            logger.warning("Fetch failed for %s: %s", path, error)
            payload = json.dumps({"error": "upstream_unavailable"}).encode()
            return reply(self, 502, payload, "application/json")
        finally:
            if output_path:
                Path(output_path).unlink(missing_ok=True)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    logger.info("NekoFlow TiaManhwa adapter ready on %s", PORT)
    try:
        server.serve_forever()
    finally:
        server.server_close()
