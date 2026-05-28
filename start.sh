#!/bin/bash
# ─────────────────────────────────────────────────────────────
# start.sh — launches the full fraud detection system via tmux
# Run from: ~/fraud-detection-system/
# Usage:    ./start.sh
# ─────────────────────────────────────────────────────────────

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BLOCKCHAIN_DIR="$BASE_DIR/blockchain/test-network"
GATEWAY_DIR="$BASE_DIR/blockchain/gateway"
BACKEND_DIR="$BASE_DIR/backend"
FRONTEND_DIR="$BASE_DIR/frontend"
SESSION="fraud"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[start]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC}  $1"; }
err()  { echo -e "${RED}[error]${NC} $1"; }

# ─────────────────────────────────────────────────────────────
# Check tmux
# ─────────────────────────────────────────────────────────────

if ! command -v tmux &>/dev/null; then
  err "tmux not installed. Run: sudo apt install tmux"
  exit 1
fi

# ─────────────────────────────────────────────────────────────
# Clean slate
# ─────────────────────────────────────────────────────────────

tmux kill-server 2>/dev/null || true
sleep 1

# ─────────────────────────────────────────────────────────────
# 0. Pre-flight checks
# ─────────────────────────────────────────────────────────────

log "Running pre-flight checks..."

if ! docker info &>/dev/null; then
  err "Docker is not running. Start Docker Desktop first."
  exit 1
fi

if [ ! -f "$BASE_DIR/.env" ]; then
  err ".env not found at $BASE_DIR/.env"
  exit 1
fi

log "Pre-flight checks passed."

# ─────────────────────────────────────────────────────────────
# 1. Start Kafka + Postgres
# ─────────────────────────────────────────────────────────────

log "Starting Kafka + Postgres (Docker Compose)..."
docker compose -f "$BASE_DIR/docker-compose.yml" up -d
log "Kafka + Postgres started."

log "Waiting for Kafka to be ready..."
for i in {1..15}; do
  if nc -z localhost 9092 2>/dev/null; then
    log "Kafka is ready."
    break
  fi
  [ $i -eq 15 ] && { err "Kafka did not start in time."; exit 1; }
  sleep 2
done

# ─────────────────────────────────────────────────────────────
# 2. Setup Kafka topics
# ─────────────────────────────────────────────────────────────

log "Setting up Kafka topics..."
cd "$BACKEND_DIR"
export $(cat "$BASE_DIR/.env" | xargs) 2>/dev/null
python3 -m src.kafka_setup 2>/dev/null || warn "Topics may already exist — continuing."

# ─────────────────────────────────────────────────────────────
# 3. Check Fabric network
# ─────────────────────────────────────────────────────────────

log "Checking Fabric network..."
if ! docker ps --format '{{.Names}}' | grep -q "peer0.org1"; then
  warn "Fabric network not running. Starting it now..."
  cd "$BLOCKCHAIN_DIR"
  ./network.sh up createChannel -c mychannel
  ./network.sh deployCC -c mychannel -ccn fraud -ccp ../chaincode/fraud-detection -ccl go
  log "Fabric network started and chaincode deployed."
else
  log "Fabric network already running — skipping."
fi

# ─────────────────────────────────────────────────────────────
# 4. Create tmux session + windows
# ─────────────────────────────────────────────────────────────

log "Creating tmux session '$SESSION'..."

# Window 0: gateway (created with the session)
tmux new-session -d -s "$SESSION" -n "gateway"

# Windows 1-4: insert after the previous window index
tmux new-window -a -t "$SESSION:0" -n "fraud-consumer"
tmux new-window -a -t "$SESSION:1" -n "chain-consumer"
tmux new-window -a -t "$SESSION:2" -n "fastapi"
tmux new-window -a -t "$SESSION:3" -n "frontend"

log "All tmux windows created. Sending commands..."

# ─────────────────────────────────────────────────────────────
# 5. Send commands to each window
# ─────────────────────────────────────────────────────────────

tmux send-keys -t "$SESSION:gateway" \
  "cd '$GATEWAY_DIR' && export \$(cat .env.gateway | xargs) && echo '=== Fabric Gateway :8080 ===' && go run main.go" Enter

tmux send-keys -t "$SESSION:fraud-consumer" \
  "cd '$BACKEND_DIR' && export \$(cat '$BASE_DIR/.env' | xargs) && echo '=== Fraud Consumer ===' && python3 -m src.kafka_fraud_consumer" Enter

tmux send-keys -t "$SESSION:chain-consumer" \
  "cd '$BACKEND_DIR' && export \$(cat '$BASE_DIR/.env' | xargs) && echo '=== Blockchain Consumer ===' && python3 -m src.kafka_blockchain_consumer" Enter

tmux send-keys -t "$SESSION:fastapi" \
  "cd '$BACKEND_DIR' && export \$(cat '$BASE_DIR/.env' | xargs) && echo '=== FastAPI :8000 ===' && python3 -m uvicorn src.api:app --reload --port 8000 --timeout-graceful-shutdown 2" Enter

tmux send-keys -t "$SESSION:frontend" \
  "cd '$FRONTEND_DIR' && echo '=== Next.js :3000 ===' && npm run dev" Enter

# Go back to gateway window
tmux select-window -t "$SESSION:gateway"

# ─────────────────────────────────────────────────────────────
# Wait for FastAPI
# ─────────────────────────────────────────────────────────────

log "Waiting for FastAPI to be ready..."
for i in {1..20}; do
  if curl -s http://localhost:8000/api/stats &>/dev/null; then
    log "FastAPI is ready."
    break
  fi
  [ $i -eq 20 ] && warn "FastAPI health check timed out — it may still be starting."
  sleep 2
done

# ─────────────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  All services started!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Fabric Gateway  → http://localhost:8080"
echo "  FastAPI         → http://localhost:8000/api/stats"
echo "  Frontend        → http://localhost:3000"
echo ""
echo "  Attach:         tmux attach -t $SESSION"
echo "  Switch windows: Ctrl+B then W (pick from list)"
echo "  Detach:         Ctrl+B then D"
echo "  Load data:      cd backend && python3 -m src.kafka_producer"
echo "  Stop:           ./stop.sh"
echo ""

tmux attach -t "$SESSION"