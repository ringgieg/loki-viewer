#!/usr/bin/env python3
"""
Send Logs Script
Sends logs with different levels to Loki for testing
"""

import requests
import time
import sys
from datetime import datetime

# Default configuration
DEFAULT_TASK_NAME = "test_task"
DEFAULT_LOKI_URL = "http://localhost:3100"


def send_log(loki_url, task_name, level, message):
    """Send a single log to Loki"""
    timestamp_ns = int(time.time() * 1_000_000_000)
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]

    log_message = f"{current_time} [{level}] [main] c.n.test.TestClass:100 - {message}"

    payload = {
        "streams": [
            {
                "stream": {
                    "job": "tasks",
                    "service": "Batch-Sync",
                    "task_name": task_name,
                    "level": level,
                    "filename": "test.log"
                },
                "values": [
                    [str(timestamp_ns), log_message]
                ]
            }
        ]
    }

    try:
        response = requests.post(
            f"{loki_url}/loki/api/v1/push",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=5
        )

        if response.status_code == 204:
            print(f"[OK] Sent {level:5} log: {message}")
            return True
        else:
            print(f"[FAIL] Failed: HTTP {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"[FAIL] Failed to send log: {e}")
        return False


if __name__ == "__main__":
    task_name = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_TASK_NAME
    loki_url = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_LOKI_URL

    print(f"\033[1;33mSending test logs to task: {task_name}\033[0m")
    print()

    # Send different types of logs
    logs = [
        ("INFO", "Application started successfully"),
        ("INFO", "Processing data batch #1234"),
        ("WARN", "Connection timeout, retrying..."),
        ("INFO", "Data batch #1234 processed successfully"),
        ("ERROR", "Failed to connect to database after 3 retries"),
        ("WARN", "Memory usage above 80%"),
        ("INFO", "Cleanup task completed"),
        ("DEBUG", "Variable state: count=42, status=active"),
        ("ERROR", "Null pointer exception in UserService.processUser()"),
        ("INFO", "Application shutdown initiated"),
    ]

    success_count = 0
    for level, message in logs:
        if send_log(loki_url, task_name, level, message):
            success_count += 1
        time.sleep(0.3)

    print()
    print(f"\033[1;36mDone! Successfully sent {success_count}/{len(logs)} logs.\033[0m")
    print(f"\033[1;37mView logs at: http://localhost:8080/batch-sync/{task_name}\033[0m")
