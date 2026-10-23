#!/usr/bin/env bash
# Run on the GCP VM (Ubuntu) that already hosts Ollama.
# Installs Tesseract + a localhost OCR sidecar. Then: ollama pull nomic-embed-text
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Re-run with sudo: sudo bash setup-vm.sh"
  exit 1
fi

apt-get update
apt-get install -y tesseract-ocr tesseract-ocr-eng poppler-utils

install -d /opt/recruitiq
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/ocr-server.js" ]]; then
  cp "${SCRIPT_DIR}/ocr-server.js" /opt/recruitiq/ocr-server.js
fi

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

KEY_LINE=""
if [[ -n "${OCR_API_KEY:-}" ]]; then
  KEY_LINE="Environment=OCR_API_KEY=${OCR_API_KEY}"
elif [[ -n "${OLLAMA_API_KEY:-}" ]]; then
  KEY_LINE="Environment=OCR_API_KEY=${OLLAMA_API_KEY}"
fi

cat >/etc/systemd/system/recruitiq-ocr.service <<UNIT
[Unit]
Description=RecruitIQ Tesseract OCR sidecar
After=network.target

[Service]
Type=simple
Environment=OCR_HOST=127.0.0.1
Environment=OCR_PORT=3100
${KEY_LINE}
ExecStart=/usr/bin/node /opt/recruitiq/ocr-server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now recruitiq-ocr

if command -v ollama >/dev/null 2>&1; then
  sudo -u "${SUDO_USER:-$(logname 2>/dev/null || echo root)}" ollama pull nomic-embed-text || ollama pull nomic-embed-text
else
  echo "ollama not on PATH — pull nomic-embed-text from your PC with: npm run pull:embeddings --prefix backend"
fi

echo
echo "OCR health:"
curl -sS http://127.0.0.1:3100/health || true
echo
echo "Put this BEFORE the Ollama location in Nginx:"
echo "  location /ocr/ { proxy_pass http://127.0.0.1:3100/; }"
echo "  location = /ocr { proxy_pass http://127.0.0.1:3100/ocr; }"
echo
echo "Then RecruitIQ uses the same host as OLLAMA_BASE_URL (POST /ocr, GET /ocr/health)."
echo
echo "Done."
