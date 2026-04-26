#!/bin/bash
# ─────────────────────────────────────────────────────────────
# stop.sh — shuts down all fraud detection system services
# Run from: ~/fraud-detection-system/
# ─────────────────────────────────────────────────────────────

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BLOCKCHAIN_DIR="$BASE_DIR/blockchain/test-network"
SESSION="fraud"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[stop]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }

# ── Kill tmux session (stops all services inside it) ─────────
if tmux has-session -t "$SESSION" 2>/dev/null; then
  log "Killing tmux session '$SESSION' (Gateway, Consumers, FastAPI, Frontend)..."
  tmux kill-session -t "$SESSION"
  log "tmux session stopped."
else
  warn "tmux session '$SESSION' was not running."
fi

# ── Stop Kafka + Postgres ─────────────────────────────────────
log "Stopping Kafka + Postgres..."
docker compose -f "$BASE_DIR/docker-compose.yml" down && log "Kafka + Postgres stopped."

# ── Optionally stop Fabric network ───────────────────────────
echo ""
read -p "Stop Fabric network too? This deletes all blockchain data. (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  log "Stopping Fabric network..."
  cd "$BLOCKCHAIN_DIR"
  ./network.sh down
  log "Fabric network stopped."
else
  log "Fabric network left running."
fi

echo ""
echo -e "${GREEN}All services stopped.${NC}"