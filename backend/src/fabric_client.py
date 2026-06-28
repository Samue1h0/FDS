import time
import requests
import json


class FabricClient:
    def __init__(self, gateway_url: str = "http://localhost:8080"):
        self.base_url = gateway_url.rstrip("/")

    @staticmethod
    def _post_with_retry(url, payload, *, timeout=30, attempts=3, backoff=3.0,
                         dup_ok=False):
        """POST that survives the chaincode container's cold start.

        The first chain write after the contract has been idle must launch the
        chaincode Docker container, which can exceed the gateway's endorse
        timeout and return 500. That same attempt kicks the container into
        starting, so a short retry succeeds. Safe because the only writes we
        retry are idempotent (UpdateGroundTruth re-sets the same values) or
        duplicate-guarded (CreateTransaction rejects dupes — `dup_ok` treats an
        "already exists" failure on a later attempt as success, in case a prior
        attempt actually committed before the response was lost)."""
        last_exc = None
        for i in range(attempts):
            try:
                resp = requests.post(url, json=payload, timeout=timeout)
                resp.raise_for_status()
                return resp.json()
            except requests.HTTPError as e:
                body = (e.response.text or "") if e.response is not None else ""
                if dup_ok and i > 0 and "already exists" in body.lower():
                    return {"status": "SUCCESS",
                            "transaction_id": payload.get("transaction_id"),
                            "note": "already on-chain"}
                last_exc = e
            except requests.RequestException as e:
                last_exc = e
            if i < attempts - 1:
                time.sleep(backoff * (i + 1))   # 3s, 6s — long enough to warm up
        raise last_exc

    def submit_transaction(self, payload: dict) -> dict:
        return self._post_with_retry(
            f"{self.base_url}/submit", payload, dup_ok=True
        )

    def get_transaction(self, transaction_id: str) -> dict:
        response = requests.get(
            f"{self.base_url}/query",
            params={"transaction_id": transaction_id},
            timeout=10
        )
        response.raise_for_status()
        return response.json()
    
    def get_all_transactions(self) -> dict:
        response = requests.get(
            f"{self.base_url}/all",
            timeout=30
        )
        response.raise_for_status()
        return response.json()

    def update_ground_truth(
        self,
        transaction_id: str,
        ground_truth_label: int,
        reviewer_id: str
    ) -> dict:
        return self._post_with_retry(
            f"{self.base_url}/update-ground-truth",
            {
                "transaction_id": transaction_id,
                "ground_truth_label": ground_truth_label,
                "reviewer_id": reviewer_id,
            },
        )

    def get_history(self, transaction_id: str) -> dict:
        response = requests.get(
            f"{self.base_url}/history",
            params={"transaction_id": transaction_id},
            timeout=10
        )
        response.raise_for_status()
        return response.json()

    def get_chain_info(self) -> dict:
        """Latest ledger state: block height + tip block hashes (qscc GetChainInfo)."""
        response = requests.get(f"{self.base_url}/chain-info", timeout=10)
        response.raise_for_status()
        return response.json()

    def get_blocks(self, count: int = 8) -> dict:
        """Last `count` blocks (newest first) with their hash-chain header fields."""
        response = requests.get(
            f"{self.base_url}/blocks",
            params={"count": count},
            timeout=15
        )
        response.raise_for_status()
        return response.json()