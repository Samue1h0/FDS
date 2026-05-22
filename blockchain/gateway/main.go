package main

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"crypto/x509"
	"encoding/pem"
	"time"

	"github.com/hyperledger/fabric-gateway/pkg/client"
	"github.com/hyperledger/fabric-gateway/pkg/identity"
	"github.com/hyperledger/fabric-protos-go-apiv2/common"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/protobuf/proto"
)

// Config loaded from environment variables
type Config struct {
	PeerEndpoint    string // e.g. localhost:7051
	GatewayPeer     string // e.g. peer0.org1.example.com
	TLSCertPath     string // path to peer TLS cert
	CertPath        string // path to client cert
	KeyPath         string // path to client private key
	MSPID           string // e.g. Org1MSP
	ChannelName     string // e.g. mychannel
	ChaincodeName   string // e.g. fraud-detection
}

func loadConfig() Config {
	return Config{
		PeerEndpoint:  getEnv("PEER_ENDPOINT", "localhost:7051"),
		GatewayPeer:   getEnv("GATEWAY_PEER", "peer0.org1.example.com"),
		TLSCertPath:   getEnv("TLS_CERT_PATH", ""),
		CertPath:      getEnv("CERT_PATH", ""),
		KeyPath:       getEnv("KEY_PATH", ""),
		MSPID:         getEnv("MSP_ID", "Org1MSP"),
		ChannelName:   getEnv("CHANNEL_NAME", "mychannel"),
		ChaincodeName: getEnv("CHAINCODE_NAME", "fraud-detection"),
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

var contract *client.Contract

// qscc is Fabric's built-in Query System Chaincode. We use it (read-only) to
// expose the ledger's real block-hash chain — proof the records can't be edited.
var qscc *client.Contract
var channelName string

func main() {
	cfg := loadConfig()

	// Set up gRPC connection to peer
	tlsCert := loadCertificate(cfg.TLSCertPath)
	certPool := x509.NewCertPool()
	certPool.AddCert(tlsCert)
	transportCreds := credentials.NewClientTLSFromCert(certPool, cfg.GatewayPeer)

	conn, err := grpc.Dial(cfg.PeerEndpoint, grpc.WithTransportCredentials(transportCreds))
	if err != nil {
		log.Fatalf("Failed to connect to peer: %v", err)
	}
	defer conn.Close()

	// Set up identity
	id := newIdentity(cfg.CertPath, cfg.MSPID)
	sign := newSigner(cfg.KeyPath)

	// Create gateway
	gw, err := client.Connect(
		id,
		client.WithSign(sign),
		client.WithClientConnection(conn),
		client.WithEvaluateTimeout(5*time.Second),
		client.WithEndorseTimeout(15*time.Second),
		client.WithSubmitTimeout(5*time.Second),
		client.WithCommitStatusTimeout(60*time.Second),
	)
	if err != nil {
		log.Fatalf("Failed to connect to gateway: %v", err)
	}
	defer gw.Close()

	network := gw.GetNetwork(cfg.ChannelName)
	contract = network.GetContract(cfg.ChaincodeName)
	qscc = network.GetContract("qscc")
	channelName = cfg.ChannelName

	// Routes
	http.HandleFunc("/submit", handleSubmit)
	http.HandleFunc("/query", handleQuery)
	http.HandleFunc("/all", handleGetAll)
	http.HandleFunc("/update-ground-truth", handleUpdateGroundTruth)
	http.HandleFunc("/history", handleHistory)
	http.HandleFunc("/chain-info", handleChainInfo)
	http.HandleFunc("/blocks", handleBlocks)

	port := getEnv("GATEWAY_PORT", "8080")
	log.Printf("Fabric Gateway REST API running on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

// POST /submit
// Body: the flat blockchain_payload JSON from your Python pipeline
func handleSubmit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusBadRequest)
		return
	}

	// Validate it's valid JSON before sending to chaincode
	var payload map[string]interface{}
	if err := json.Unmarshal(body, &payload); err != nil {
		http.Error(w, "Invalid JSON payload", http.StatusBadRequest)
		return
	}

	_, err = contract.SubmitTransaction("CreateTransaction", string(body))
	if err != nil {
		writeError(w, fmt.Sprintf("Failed to submit transaction: %v", err), http.StatusInternalServerError)
		return
	}

	writeJSON(w, map[string]string{
		"status":         "SUCCESS",
		"transaction_id": fmt.Sprintf("%v", payload["transaction_id"]),
	})
}

// GET /query?transaction_id=xxx
func handleQuery(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	txID := r.URL.Query().Get("transaction_id")
	if txID == "" {
		http.Error(w, "transaction_id is required", http.StatusBadRequest)
		return
	}

	result, err := contract.EvaluateTransaction("GetTransaction", txID)
	if err != nil {
		writeError(w, fmt.Sprintf("Failed to query transaction: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(result)
}

func handleGetAll(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	result, err := contract.EvaluateTransaction("GetAllTransactions")
	if err != nil {
		writeError(w, fmt.Sprintf("Failed to get transactions: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(result)
}

// POST /update-ground-truth
// Body: {"transaction_id": "...", "ground_truth_label": 1, "reviewer_id": "..."}
func handleUpdateGroundTruth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		TransactionID    string `json:"transaction_id"`
		GroundTruthLabel int    `json:"ground_truth_label"`
		ReviewerID       string `json:"reviewer_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}

	if req.TransactionID == "" || req.ReviewerID == "" {
		http.Error(w, "transaction_id and reviewer_id are required", http.StatusBadRequest)
		return
	}

	_, err := contract.SubmitTransaction(
		"UpdateGroundTruth",
		req.TransactionID,
		fmt.Sprintf("%d", req.GroundTruthLabel),
		req.ReviewerID,
	)
	if err != nil {
		writeError(w, fmt.Sprintf("Failed to update ground truth: %v", err), http.StatusInternalServerError)
		return
	}

	writeJSON(w, map[string]string{
		"status":         "SUCCESS",
		"transaction_id": req.TransactionID,
	})
}

// GET /history?transaction_id=xxx
func handleHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	txID := r.URL.Query().Get("transaction_id")
	if txID == "" {
		http.Error(w, "transaction_id is required", http.StatusBadRequest)
		return
	}

	result, err := contract.EvaluateTransaction("GetTransactionHistory", txID)
	if err != nil {
		writeError(w, fmt.Sprintf("Failed to get history: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(result)
}

// GET /chain-info
// Latest ledger state via qscc.GetChainInfo — block height and the hash of the
// newest block plus its predecessor (the tip of the immutable hash chain).
func handleChainInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	result, err := qscc.EvaluateTransaction("GetChainInfo", channelName)
	if err != nil {
		writeError(w, fmt.Sprintf("Failed to get chain info: %v", err), http.StatusInternalServerError)
		return
	}

	info := &common.BlockchainInfo{}
	if err := proto.Unmarshal(result, info); err != nil {
		writeError(w, fmt.Sprintf("Failed to decode chain info: %v", err), http.StatusInternalServerError)
		return
	}

	writeJSON(w, map[string]interface{}{
		"channel":             channelName,
		"height":              info.GetHeight(),
		"current_block_hash":  hex.EncodeToString(info.GetCurrentBlockHash()),
		"previous_block_hash": hex.EncodeToString(info.GetPreviousBlockHash()),
	})
}

// GET /blocks?count=N
// The last N blocks (newest first) via qscc.GetBlockByNumber, reduced to the
// header fields that form the hash chain: number, data hash, previous-block hash.
func handleBlocks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	count := 8
	if c := r.URL.Query().Get("count"); c != "" {
		if n, err := strconv.Atoi(c); err == nil && n > 0 && n <= 50 {
			count = n
		}
	}

	// Current height tells us where the tip is.
	infoBytes, err := qscc.EvaluateTransaction("GetChainInfo", channelName)
	if err != nil {
		writeError(w, fmt.Sprintf("Failed to get chain info: %v", err), http.StatusInternalServerError)
		return
	}
	info := &common.BlockchainInfo{}
	if err := proto.Unmarshal(infoBytes, info); err != nil {
		writeError(w, fmt.Sprintf("Failed to decode chain info: %v", err), http.StatusInternalServerError)
		return
	}

	height := info.GetHeight() // number of blocks; newest block number is height-1
	type blockSummary struct {
		Number       uint64 `json:"number"`
		DataHash     string `json:"data_hash"`
		PreviousHash string `json:"previous_hash"`
		TxCount      int    `json:"tx_count"`
	}
	var blocks []blockSummary

	for i := 0; i < count && uint64(i) < height; i++ {
		num := height - 1 - uint64(i)
		blockBytes, err := qscc.EvaluateTransaction("GetBlockByNumber", channelName, strconv.FormatUint(num, 10))
		if err != nil {
			break
		}
		block := &common.Block{}
		if err := proto.Unmarshal(blockBytes, block); err != nil {
			continue
		}
		hdr := block.GetHeader()
		txCount := 0
		if data := block.GetData(); data != nil {
			txCount = len(data.GetData())
		}
		blocks = append(blocks, blockSummary{
			Number:       hdr.GetNumber(),
			DataHash:     hex.EncodeToString(hdr.GetDataHash()),
			PreviousHash: hex.EncodeToString(hdr.GetPreviousHash()),
			TxCount:      txCount,
		})
	}

	writeJSON(w, map[string]interface{}{
		"channel": channelName,
		"height":  height,
		"blocks":  blocks,
	})
}

// ── Helpers ──────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func loadCertificate(path string) *x509.Certificate {
	data, err := os.ReadFile(path)
	if err != nil {
		log.Fatalf("Failed to read TLS cert: %v", err)
	}
	block, _ := pem.Decode(data)
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		log.Fatalf("Failed to parse TLS cert: %v", err)
	}
	return cert
}

func newIdentity(certPath, mspID string) *identity.X509Identity {
	data, err := os.ReadFile(certPath)
	if err != nil {
		log.Fatalf("Failed to read cert: %v", err)
	}
	cert, err := identity.CertificateFromPEM(data)
	if err != nil {
		log.Fatalf("Failed to parse cert: %v", err)
	}
	id, err := identity.NewX509Identity(mspID, cert)
	if err != nil {
		log.Fatalf("Failed to create identity: %v", err)
	}
	return id
}

func newSigner(keyPath string) identity.Sign {
	data, err := os.ReadFile(keyPath)
	if err != nil {
		log.Fatalf("Failed to read private key: %v", err)
	}
	key, err := identity.PrivateKeyFromPEM(data)
	if err != nil {
		log.Fatalf("Failed to parse private key: %v", err)
	}
	sign, err := identity.NewPrivateKeySign(key)
	if err != nil {
		log.Fatalf("Failed to create signer: %v", err)
	}
	return sign
}