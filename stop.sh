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

# ── Fabric network: choose how far to take it down ───────────
# Volumes (the ledger) survive Docker Desktop closing and reboots — they only
# die when the containers are *removed*. So "stop" keeps the chain; only "wipe"
# (network.sh down) deletes it.
echo ""
echo "Fabric network options:"
echo "  [1] Leave it running          (default)"
echo "  [2] Stop containers, KEEP ledger   ← safe to shut down the device after this"
echo "  [3] Wipe everything           (deletes ALL blockchain data — irreversible)"
read -p "Choose 1/2/3: " -n 1 -r FABRIC_CHOICE
echo

case "$FABRIC_CHOICE" in
  2)
    log "Stopping Fabric containers (ledger volumes preserved)..."
    # Peers + orderer carry the service=hyperledger-fabric label; the chaincode
    # containers (dev-peer*) are spawned by the peer and don't, so match both.
    fabric_ids="$(docker ps -q --filter 'label=service=hyperledger-fabric'; docker ps -q --filter 'name=dev-peer')"
    fabric_ids="$(echo "$fabric_ids" | tr '\n' ' ' | xargs)"
    if [ -n "$fabric_ids" ]; then
      docker stop $fabric_ids >/dev/null
      log "Fabric containers stopped. Ledger data retained — './start.sh' will resume it."
    else
      warn "No running Fabric containers found."
    fi
    ;;
  3)
    warn "Wiping Fabric network and ALL blockchain data..."
    cd "$BLOCKCHAIN_DIR"
    ./network.sh down
    log "Fabric network wiped."
    ;;
  *)
    log "Fabric network left running."
    ;;
esac

echo ""
echo -e "${GREEN}All services stopped.${NC}"