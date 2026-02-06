#!/usr/bin/env python3
"""
Trigger Alert Script
Sends logs with different levels to Loki for testing
Supports: ERROR, WARN, INFO, DEBUG, or MIXED (all levels)
"""

import requests
import time
import sys
from datetime import datetime

# Default configuration
DEFAULT_TASK_NAME = "test_task"
DEFAULT_COUNT = 10
DEFAULT_LEVEL = "MIXED"
DEFAULT_VMLOG_URL = "http://127.0.0.1:9428"
DEFAULT_PUSH_PATH = "/insert/loki/api/v1/push"


def _session_no_proxy():
    """Create a requests session that ignores system proxy env vars."""
    s = requests.Session()
    s.trust_env = False
    return s

# Log level configurations
LOG_LEVELS = {
    "ERROR": {
        "color": "\033[1;31m",  # Red
        "messages": [
            "Connection timeout to database after 30 seconds",
            "Failed to authenticate: oauth token is empty",
            "NullPointerException in DataSourceManager.connect()",
            "Unable to process ETL task: source unavailable",
            "Critical error: data integrity check failed"
        ]
    },
    "WARN": {
        "color": "\033[1;33m",  # Yellow
        "messages": [
            "Slow query detected: execution time 5.2s",
            "Memory usage at 85%, consider increasing heap size",
            "Deprecated API endpoint called, please update",
            "Connection pool near capacity: 18/20 connections used",
            "Retry attempt 3/5 for remote service call"
        ]
    },
    "INFO": {
        "color": "\033[1;36m",  # Cyan
        "messages": [
            "ETL task completed successfully in 2.3s",
            "Processing batch of 1000 records",
            "Cache refreshed with 523 entries",
            "API request completed: GET /api/metrics status=200",
            "Scheduled task executed: data-sync-hourly"
        ]
    },
    "DEBUG": {
        "color": "\033[1;37m",  # White
        "messages": [
            "Entering method: DataSourceManager.validateConnection()",
            "Query parameters: offset=0, limit=100, sort=desc",
            "Retrieved configuration: max_connections=20, timeout=30s",
            "Cached result found for key: user_metrics_2025_01",
            "Thread pool status: active=3, queued=0, completed=47"
        ]
    }
}


def send_log(vmlog_url, task_name, log_number, level, total_count, push_path=DEFAULT_PUSH_PATH):
    """Send a single log with specified level to vmlog (Loki push-compatible endpoint)."""
    # Generate timestamp in nanoseconds
    timestamp_ns = int(time.time() * 1_000_000_000)

    # Get level configuration
    level_config = LOG_LEVELS.get(level, LOG_LEVELS["INFO"])
    messages = level_config["messages"]
    color = level_config["color"]

    # Select message based on log number
    message_index = (log_number - 1) % len(messages)
    message_text = messages[message_index]

    # Create log message
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    log_message = (
        f"{current_time} [{level}] [Thread-{log_number}] "
        f"c.n.test.LogTest:{40 + log_number} - {message_text}"
    )

    # Prepare Loki push payload
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
            reset = "\033[0m"
            print(f"{color}[{level}]{reset} [{log_number}/{total_count}] Sent: {message_text[:60]}...")
            return True
        else:
            print(f"[FAIL] [{log_number}/{total_count}] Failed: HTTP {response.status_code} - {response.text}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"[FAIL] [{log_number}/{total_count}] Failed to send log: {e}")
        return False


def get_level_for_log(log_number, mode):
    """Determine log level based on mode and log number"""
    if mode == "MIXED":
        # Distribute logs across different levels
        # ERROR: 20%, WARN: 30%, INFO: 40%, DEBUG: 10%
        remainder = log_number % 10
        if remainder <= 2:
            return "ERROR"
        elif remainder <= 5:
            return "WARN"
        elif remainder <= 9:
            return "INFO"
        else:
            return "DEBUG"
    else:
        return mode


if __name__ == "__main__":
    # Parse command line arguments
    task_name = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_TASK_NAME
    count = int(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_COUNT
    level_mode = sys.argv[3].upper() if len(sys.argv) > 3 else DEFAULT_LEVEL
    vmlog_url = sys.argv[4] if len(sys.argv) > 4 else DEFAULT_VMLOG_URL
    push_path = sys.argv[5] if len(sys.argv) > 5 else DEFAULT_PUSH_PATH

    # Validate level
    if level_mode not in ["ERROR", "WARN", "INFO", "DEBUG", "MIXED"]:
        print(f"\033[1;31mInvalid level: {level_mode}\033[0m")
        print("Valid levels: ERROR, WARN, INFO, DEBUG, MIXED")
        sys.exit(1)

    print(f"\033[1;33m{'='*60}\033[0m")
    print(f"\033[1;36mLoki Log Sender - Test Script\033[0m")
    print(f"\033[1;33m{'='*60}\033[0m")
    print(f"Task Name:  \033[1;37m{task_name}\033[0m")
    print(f"Log Count:  \033[1;37m{count}\033[0m")
    print(f"Level Mode: \033[1;37m{level_mode}\033[0m")
    print(f"vmlog URL:  \033[1;37m{vmlog_url}\033[0m")
    print(f"Push Path:  \033[1;37m{push_path}\033[0m")
    print(f"\033[1;33m{'='*60}\033[0m")
    print()

    # Send logs
    success_count = 0
    level_counts = {"ERROR": 0, "WARN": 0, "INFO": 0, "DEBUG": 0}

    for i in range(1, count + 1):
        level = get_level_for_log(i, level_mode)
        if send_log(vmlog_url, task_name, i, level, count, push_path=push_path):
            success_count += 1
            level_counts[level] += 1
        time.sleep(0.3)  # Reduced delay for faster testing

    print()
    print(f"\033[1;33m{'='*60}\033[0m")
    print(f"\033[1;36mResults\033[0m")
    print(f"\033[1;33m{'='*60}\033[0m")
    print(f"Total Sent: \033[1;32m{success_count}/{count}\033[0m")

    if level_mode == "MIXED":
        print(f"\nBreakdown by level:")
        print(f"  \033[1;31mERROR:\033[0m {level_counts['ERROR']}")
        print(f"  \033[1;33mWARN:\033[0m  {level_counts['WARN']}")
        print(f"  \033[1;36mINFO:\033[0m  {level_counts['INFO']}")
        print(f"  \033[1;37mDEBUG:\033[0m {level_counts['DEBUG']}")

    print()
    print(f"\033[1;33mNext Steps:\033[0m")
    print(f"\033[1;37m1. Open http://localhost:8080 in your browser\033[0m")

    if level_mode in ["ERROR", "MIXED"]:
        print(f"\033[1;37m2. Right-click on task '{task_name}' and select '监控' (Watch)\033[0m")
        print(f"\033[1;37m3. Run this script again to trigger alert overlay\033[0m")
    else:
        print(f"\033[1;37m2. Click on task '{task_name}' to view the logs\033[0m")
        print(f"\033[1;37m3. Test log level filtering (ERROR/WARN/INFO/DEBUG)\033[0m")

    print(f"\033[1;33m{'='*60}\033[0m")
    print()
    print("\033[1;33mUsage:\033[0m")
    print(f"\033[1;37m  python trigger_alert.py [task_name] [count] [level] [vmlog_url] [push_path]\033[0m")
    print()
    print("\033[1;33mExamples:\033[0m")
    print(f"\033[1;37m  python trigger_alert.py my_task 20 MIXED\033[0m")
    print(f"\033[1;37m  python trigger_alert.py my_task 10 ERROR\033[0m")
    print(f"\033[1;37m  python trigger_alert.py my_task 15 WARN\033[0m")
