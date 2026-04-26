# Blockchain Instruction (Terminal 1)



#### From test-network:



./network.sh up createChannel -c mychannel





#### Then deploy your chaincode:



./network.sh deployCC -c mychannel -ccn fraud -ccp ../chaincode/fraud-detection -ccl go





#### Set CLI environment for Org1



cd \~/fraud-detection-system/blockchain/test-network/

export $(cat .env.peer | xargs)

export PATH=$PATH\_EXTRA:$PATH



export PATH=${PWD}/../bin:$PATH

export FABRIC\_CFG\_PATH=$PWD/../config/

export CORE\_PEER\_TLS\_ENABLED=true

export CORE\_PEER\_LOCALMSPID=Org1MSP

export CORE\_PEER\_TLS\_ROOTCERT\_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt

export CORE\_PEER\_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp

export CORE\_PEER\_ADDRESS=localhost:7051







#### Insert one transaction into blockchain



peer chaincode invoke -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" -C mychannel -n fraud --peerAddresses localhost:7051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" --peerAddresses localhost:9051 --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" -c '{"function":"CreateTransaction","Args":\["{\\"transaction\_id\\":\\"TXN1001\\",\\"timestamp\\":\\"2026-04-02 15:00:00\\",\\"amount\_myr\\":2500.75,\\"merchant\_name\\":\\"ABC Electronics\\",\\"mcc\\":\\"5732\\",\\"mode\\":\\"Online\\",\\"location\\":\\"Kuala Lumpur\\",\\"ip\_address\\":\\"192.168.1.10\\",\\"device\_information\\":\\"Windows Chrome\\",\\"customer\_ref\\":\\"CUST001\\",\\"ic\_hash\\":\\"abc123hash\\",\\"masked\_card\_number\\":\\"\*\*\*\*1234\\",\\"fraud\_score\\":0.91,\\"ml\_prediction\\":1,\\"rule\_flag\\":1,\\"final\_label\\":\\"fraud\\",\\"risk\_reasons\\":\[\\"High ML fraud score\\",\\"Suspicious device\\"],\\"ground\_truth\_label\\":1}"]}'





#### Query one transaction by ID



peer chaincode query -C mychannel -n fraud -c '{"function":"GetTransaction","Args":\["TXN00001"]}'





#### Query all transactions



peer chaincode query -C mychannel -n fraud -c '{"function":"GetAllTransactions","Args":\[]}'





# Fabric API Gateway (Terminal 2) - localhost:8080



##### Export env vars



cd \~/fraud-detection-system/blockchain/gateway

export $(cat .env.gateway | xargs)





export PEER\_ENDPOINT=localhost:7051

export GATEWAY\_PEER=peer0.org1.example.com

export TLS\_CERT\_PATH=\~/fraud-detection-system/blockchain/test-network/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt

export CERT\_PATH=\~/fraud-detection-system/blockchain/test-network/organizations/peerOrganizations/org1.example.com/users/User1@org1.example.com/msp/signcerts/User1@org1.example.com-cert.pem

export KEY\_PATH=\~/fraud-detection-system/blockchain/test-network/organizations/peerOrganizations/org1.example.com/users/User1@org1.example.com/msp/keystore/priv\_sk

export MSP\_ID=Org1MSP

export CHANNEL\_NAME=mychannel

export CHAINCODE\_NAME=fraud





##### Run the gateway



go run main.go



Test:

curl "http://localhost:8080/query?transaction\_id=TXN0002"	(Query)

curl http://localhost:8080/all | head -c 200			(All)





# Kafka Instructions



##### In fraud-detection-system



docker compose up -d



CLOSE: docker compose down



##### Go into backend



Dependencies: pip3 install confluent-kafka --break-system-packages



python3 -m src.kafka\_setup





##### Fraud Consumer (Terminal 3) - Listen for data



Dependencies:

pip3 install cryptography --break-system-packages -> For .env

pip3 install psycopg2-binary --break-system-packages



export $(cat ../.env | xargs)

python3 -m src.kafka\_fraud\_consumer





##### Fraud Blockchain (Terminal 4) - Listen for data



export $(cat ../.env | xargs)

python3 -m src.kafka\_blockchain\_consumer





##### Load Data into Kafka (Run this when Consumer and Blockchain is Listening)



Dependencies: pip3 install pandas scikit-learn joblib --break-system-packages



python3 -m src.kafka\_producer





##### Verify that "Messages" (Data) are there



docker compose -f \~/fraud-detection-system/docker-compose.yml exec kafka kafka-console-consumer \\

&#x20; --bootstrap-server localhost:9092 \\

&#x20; --topic raw-transactions \\

&#x20; --from-beginning \\

&#x20; --max-messages 2





# FastAPI (Dashboard) - Terminal 5 - localhost:8000



##### Start API



export $(cat ../.env | xargs)

python3 -m uvicorn src.api:app --reload --port 8000



Test: curl http://localhost:8000/api/stats





# Postgre



##### Check Private Table (Postgre)



docker compose -f \~/fraud-detection-system/docker-compose.yml exec postgres psql -U fraud\_user -d fraud\_private -c "SELECT transaction\_id, cardholder\_name, customer\_ref, amount\_myr, ground\_truth\_label FROM private\_transactions LIMIT 5;"





##### Check Transaction Count (Postgre)



docker compose -f \~/fraud-detection-system/docker-compose.yml exec postgres psql -U fraud\_user -d fraud\_private -c "SELECT transaction\_id, cardholder\_name, customer\_ref, amount\_myr, ground\_truth\_label FROM private\_transactions LIMIT 5;"





# FRONTEND (NEXT.JS) Terminal 6 - localhost:3000

clean uninstall:

rm -rf node\_modules

rm package-lock.json



Run:



npm run dev

