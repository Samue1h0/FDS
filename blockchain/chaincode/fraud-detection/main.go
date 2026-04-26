package main

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

type FraudTransaction struct {
	// Transaction details
	TransactionID    string   `json:"transaction_id"`
	Timestamp        string   `json:"timestamp"`
	AmountMYR        float64  `json:"amount_myr"`
	MerchantName     string   `json:"merchant_name"`
	MCC              string   `json:"mcc"`
	Mode             string   `json:"mode"`
	Location         string   `json:"location"`

	// Privacy-safe customer identifiers
	CustomerRef      string   `json:"customer_ref"`
	ICHash           string   `json:"ic_hash"`
	MaskedCardNumber string   `json:"masked_card_number"`

	// Fraud assessment
	FraudScore       float64  `json:"fraud_score"`
	MLPrediction     int      `json:"ml_prediction"`
	RuleFlag         int      `json:"rule_flag"`
	FinalLabel       string   `json:"predicted_label"`
	RiskReasons      []string `json:"risk_reasons"`

	// Review outcome
	GroundTruthLabel int      `json:"ground_truth_label"`
	ReviewedBy       string   `json:"reviewed_by"`
	ReviewedAt       string   `json:"reviewed_at"`

	// Audit
	CreatedBy        string   `json:"created_by"`
	CreatedAt        string   `json:"created_at"`
}

type FraudChaincode struct {
	contractapi.Contract
}

func (fc *FraudChaincode) TransactionExists(ctx contractapi.TransactionContextInterface, transactionID string) (bool, error) {
	transactionJSON, err := ctx.GetStub().GetState(transactionID)
	if err != nil {
		return false, fmt.Errorf("failed to read from world state: %v", err)
	}
	return transactionJSON != nil, nil
}

func (fc *FraudChaincode) CreateTransaction(ctx contractapi.TransactionContextInterface, transactionJSON string) error {
	var transaction FraudTransaction

	err := json.Unmarshal([]byte(transactionJSON), &transaction)
	if err != nil {
		return fmt.Errorf("failed to unmarshal transaction JSON: %v", err)
	}

	if transaction.TransactionID == "" {
		return fmt.Errorf("transaction_id is required")
	}

	exists, err := fc.TransactionExists(ctx, transaction.TransactionID)
	if err != nil {
		return err
	}
	if exists {
		return fmt.Errorf("transaction %s already exists", transaction.TransactionID)
	}

	clientOrg, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		clientOrg = "Unknown"
	}

	if transaction.Timestamp == "" {
		transaction.Timestamp = time.Now().Format("2006-01-02 15:04:05")
	}

	transaction.CreatedBy = clientOrg
	transaction.CreatedAt = time.Now().Format("2006-01-02 15:04:05")

	// Always set review fields so Fabric response schema stays consistent
	transaction.GroundTruthLabel = 0
	transaction.ReviewedBy = ""
	transaction.ReviewedAt = ""

	if transaction.RiskReasons == nil {
		transaction.RiskReasons = []string{}
	}

	transactionBytes, err := json.Marshal(transaction)
	if err != nil {
		return fmt.Errorf("failed to marshal transaction: %v", err)
	}

	return ctx.GetStub().PutState(transaction.TransactionID, transactionBytes)
}

func (fc *FraudChaincode) GetTransaction(ctx contractapi.TransactionContextInterface, transactionID string) (FraudTransaction, error) {
	transactionJSON, err := ctx.GetStub().GetState(transactionID)
	if err != nil {
		return FraudTransaction{}, fmt.Errorf("failed to read transaction: %v", err)
	}
	if transactionJSON == nil {
		return FraudTransaction{}, fmt.Errorf("transaction %s does not exist", transactionID)
	}

	var transaction FraudTransaction
	err = json.Unmarshal(transactionJSON, &transaction)
	if err != nil {
		return FraudTransaction{}, fmt.Errorf("failed to unmarshal transaction: %v", err)
	}

	// Safety for older records
	if transaction.RiskReasons == nil {
		transaction.RiskReasons = []string{}
	}

	return transaction, nil
}

func (fc *FraudChaincode) GetAllTransactions(ctx contractapi.TransactionContextInterface) ([]FraudTransaction, error) {
	resultsIterator, err := ctx.GetStub().GetStateByRange("", "")
	if err != nil {
		return nil, fmt.Errorf("failed to get state by range: %v", err)
	}
	defer resultsIterator.Close()

	var transactions []FraudTransaction

	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to iterate results: %v", err)
		}

		var transaction FraudTransaction
		err = json.Unmarshal(queryResponse.Value, &transaction)
		if err != nil {
			return nil, fmt.Errorf("failed to unmarshal transaction record: %v", err)
		}

		// Safety for older records
		if transaction.RiskReasons == nil {
			transaction.RiskReasons = []string{}
		}
		if transaction.ReviewedBy == "" {
			transaction.ReviewedBy = ""
		}
		if transaction.ReviewedAt == "" {
			transaction.ReviewedAt = ""
		}

		transactions = append(transactions, transaction)
	}

	return transactions, nil
}

func (fc *FraudChaincode) UpdateGroundTruth(
	ctx contractapi.TransactionContextInterface,
	transactionID string,
	groundTruthLabel int,
	reviewerID string,
) error {
	transactionJSON, err := ctx.GetStub().GetState(transactionID)
	if err != nil {
		return fmt.Errorf("failed to read transaction: %v", err)
	}
	if transactionJSON == nil {
		return fmt.Errorf("transaction %s does not exist", transactionID)
	}

	var transaction FraudTransaction
	if err := json.Unmarshal(transactionJSON, &transaction); err != nil {
		return fmt.Errorf("failed to unmarshal transaction: %v", err)
	}

	if groundTruthLabel != 0 && groundTruthLabel != 1 {
		return fmt.Errorf("ground_truth_label must be 0 or 1, got %d", groundTruthLabel)
	}

	if reviewerID == "" {
		return fmt.Errorf("reviewer_id is required")
	}

	transaction.GroundTruthLabel = groundTruthLabel
	transaction.ReviewedBy = reviewerID
	transaction.ReviewedAt = time.Now().Format("2006-01-02 15:04:05")

	transactionBytes, err := json.Marshal(transaction)
	if err != nil {
		return fmt.Errorf("failed to marshal transaction: %v", err)
	}

	return ctx.GetStub().PutState(transactionID, transactionBytes)
}

func (fc *FraudChaincode) GetTransactionHistory(
	ctx contractapi.TransactionContextInterface,
	transactionID string,
) (string, error) {
	historyIterator, err := ctx.GetStub().GetHistoryForKey(transactionID)
	if err != nil {
		return "", fmt.Errorf("failed to get history for transaction: %v", err)
	}
	defer historyIterator.Close()

	type HistoryRecord struct {
		TxID      string           `json:"tx_id"`
		Timestamp string           `json:"timestamp"`
		IsDelete  bool             `json:"is_delete"`
		Record    FraudTransaction `json:"record"`
	}

	var history []HistoryRecord

	for historyIterator.HasNext() {
		entry, err := historyIterator.Next()
		if err != nil {
			return "", fmt.Errorf("failed to iterate history: %v", err)
		}

		var tx FraudTransaction
		if len(entry.Value) > 0 {
			if err := json.Unmarshal(entry.Value, &tx); err != nil {
				continue
			}
		}

		if tx.RiskReasons == nil {
			tx.RiskReasons = []string{}
		}

		history = append(history, HistoryRecord{
			TxID:      entry.TxId,
			Timestamp: time.Unix(entry.Timestamp.Seconds, 0).Format("2006-01-02 15:04:05"),
			IsDelete:  entry.IsDelete,
			Record:    tx,
		})
	}

	historyBytes, err := json.Marshal(history)
	if err != nil {
		return "", fmt.Errorf("failed to marshal history: %v", err)
	}

	return string(historyBytes), nil
}

func main() {
	chaincode, err := contractapi.NewChaincode(&FraudChaincode{})
	if err != nil {
		panic(err)
	}

	if err := chaincode.Start(); err != nil {
		panic(err)
	}
}