#!/usr/bin/env python3
"""
Trigger Alert Script
Sends ERROR logs to Loki to trigger the alert overlay
"""

import requests
import time
import sys
from datetime import datetime

# Default configuration
DEFAULT_TASK_NAME = "test_task"
DEFAULT_COUNT = 5
DEFAULT_LOKI_URL = "http://localhost:3100"


def send_error_log(loki_url, task_name, log_number):
    """Send a single ERROR log to Loki"""
    # Generate timestamp in nanoseconds
    timestamp_ns = int(time.time() * 1_000_000_000)

    # Create log message
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    log_message = (
        f"{current_time} [ERROR] [Thread-{log_number}] "
        f"c.n.test.AlertTest:42 - Test error message {log_number} - "
        f"This is a simulated error to trigger alert overlay"
    )

    # Prepare Loki push payload
    payload = {
        "streams": [
            {
                "stream": {
                    "job": "tasks",
                    "service": "Batch-Sync",
                    "task_name": task_name,
                    "level": "ERROR",
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
            print(f"[OK] [{log_number}/{count}] Sent ERROR log (timestamp: {timestamp_ns})")
            return True
        else:
            print(f"[FAIL] [{log_number}/{count}] Failed: HTTP {response.status_code} - {response.text}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"[FAIL] [{log_number}/{count}] Failed to send log: {e}")
        return False


if __name__ == "__main__":
    # Parse command line arguments
    task_name = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_TASK_NAME
    count = int(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_COUNT
    loki_url = sys.argv[3] if len(sys.argv) > 3 else DEFAULT_LOKI_URL

    print(f"\033[1;33mTriggering alert for task: {task_name}\033[0m")
    print(f"\033[1;33mSending {count} ERROR logs to Loki...\033[0m")
    print()

    # Send logs
    success_count = 0
    for i in range(1, count + 1):
        if send_error_log(loki_url, task_name, i):
            success_count += 1
        time.sleep(0.5)

    print()
    print(f"\033[1;36mDone! Successfully sent {success_count}/{count} ERROR logs.\033[0m")
    print()
    print("\033[1;33mAction required:\033[0m")
    print(f"\033[1;37m1. Open http://localhost:8080 in your browser\033[0m")
    print(f"\033[1;37m2. Right-click on task '{task_name}' and select '监控' (Watch)\033[0m")
    print(f"\033[1;37m3. Run this script again to trigger the alert overlay\033[0m")
