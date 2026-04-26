import requests
import json


class FabricClient:
    def __init__(self, gateway_url: str = "http://localhost:8080"):
        self.base_url = gateway_url.rstrip("/")

    def submit_transaction(self, payload: dict) -> dict:
        response = requests.post(
            f"{self.base_url}/submit",
            json=payload,
            timeout=30
        )
        response.raise_for_status()
        return response.json()

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
        response = requests.post(
            f"{self.base_url}/update-ground-truth",
            json={
                "transaction_id": transaction_id,
                "ground_truth_label": ground_truth_label,
                "reviewer_id": reviewer_id
            },
            timeout=30
        )
        response.raise_for_status()
        return response.json()

    def get_history(self, transaction_id: str) -> dict:
        response = requests.get(
            f"{self.base_url}/history",
            params={"transaction_id": transaction_id},
            timeout=10
        )
        response.raise_for_status()
        return response.json()