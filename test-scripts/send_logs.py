#!/usr/bin/env python3
"""
Send Logs Script
Sends logs with different levels to VictoriaLogs (vmlog) for testing.

Note: vmlog supports Loki push ingestion via /insert/loki/api/v1/push.
"""

import requests
import time
import sys
from datetime import datetime

# Default configuration
DEFAULT_TASK_NAME = "test_task"
DEFAULT_VMLOG_URL = "http://127.0.0.1:9428"
DEFAULT_PUSH_PATH = "/insert/loki/api/v1/push"


def _session_no_proxy():
    """Create a requests session that ignores system proxy env vars."""
    s = requests.Session()
    # On some Windows setups, HTTP(S)_PROXY causes localhost calls to go through
    # a corporate proxy, resulting in 503.
    s.trust_env = False
    return s


def send_log(vmlog_url, task_name, level, message, push_path=DEFAULT_PUSH_PATH):
    """Send a single log to vmlog (Loki push-compatible endpoint)."""
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
        base = vmlog_url.rstrip("/")
        path = push_path if push_path.startswith("/") else f"/{push_path}"
        push_url = f"{base}{path}"

        response = _session_no_proxy().post(
            push_url,
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
    vmlog_url = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_VMLOG_URL
    push_path = sys.argv[3] if len(sys.argv) > 3 else DEFAULT_PUSH_PATH

    print(f"\033[1;33mSending test logs to task: {task_name}\033[0m")
    print(f"\033[1;37mvmlog: {vmlog_url} (push: {push_path})\033[0m")
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
        if send_log(vmlog_url, task_name, level, message, push_path=push_path):
            success_count += 1
        time.sleep(0.3)

    print()
    print(f"\033[1;36mDone! Successfully sent {success_count}/{len(logs)} logs.\033[0m")
    print(f"\033[1;37mView logs at: http://localhost:8080/logs/batch-sync/{task_name}\033[0m")

    # Return non-zero if nothing was sent successfully (helps CI / quick feedback)
    if success_count == 0:
        sys.exit(2)
