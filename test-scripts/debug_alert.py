#!/usr/bin/env python3
"""
Debug Alert Script
Helps diagnose why alerts are not triggering
"""

import requests
import time
import sys
from datetime import datetime

DEFAULT_LOKI_URL = "http://localhost:3100"
TASK_NAME = "test_alert"


def print_step(step_num, message):
    """Print a numbered step"""
    print(f"\n{'='*60}")
    print(f"STEP {step_num}: {message}")
    print(f"{'='*60}")


def check_loki_connection(loki_url):
    """Check if Loki is accessible"""
    try:
        response = requests.get(f"{loki_url}/ready", timeout=3)
        if response.status_code == 200:
            print(f"[OK] Loki is running at {loki_url}")
            return True
        else:
            print(f"[FAIL] Loki responded with status {response.status_code}")
            return False
    except Exception as e:
        print(f"[FAIL] Cannot connect to Loki: {e}")
        print(f"      Make sure Loki is running: docker ps | grep loki")
        return False


def send_test_log(loki_url):
    """Send a test ERROR log"""
    timestamp_ns = int(time.time() * 1_000_000_000)
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]

    log_message = (
        f"{current_time} [ERROR] [TestThread] "
        f"c.n.test.AlertDebug:99 - **TEST ALERT** This is a test error "
        f"to trigger the alert overlay - timestamp: {timestamp_ns}"
    )

    payload = {
        "streams": [
            {
                "stream": {
                    "job": "tasks",
                    "service": "Batch-Sync",
                    "task_name": TASK_NAME,
                    "level": "ERROR",
                    "filename": "debug.log"
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
            print(f"[OK] Sent ERROR log successfully")
            print(f"     Timestamp: {timestamp_ns}")
            print(f"     Task: {TASK_NAME}")
            print(f"     Level: ERROR")
            return True
        else:
            print(f"[FAIL] HTTP {response.status_code}: {response.text}")
            return False
    except Exception as e:
        print(f"[FAIL] Failed to send log: {e}")
        return False


def check_task_exists(loki_url):
    """Check if the test task exists in Loki"""
    try:
        response = requests.get(
            f"{loki_url}/loki/api/v1/label/task_name/values",
            timeout=5
        )
        if response.status_code == 200:
            data = response.json()
            tasks = data.get('data', [])
            if TASK_NAME in tasks:
                print(f"[OK] Task '{TASK_NAME}' exists in Loki")
                return True
            else:
                print(f"[INFO] Task '{TASK_NAME}' not found yet")
                print(f"       Available tasks: {', '.join(tasks[:5])}")
                return False
        else:
            print(f"[FAIL] Cannot fetch tasks: HTTP {response.status_code}")
            return False
    except Exception as e:
        print(f"[FAIL] Error checking tasks: {e}")
        return False


def main():
    loki_url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_LOKI_URL

    print("\n" + "="*60)
    print("Alert Overlay Debug Tool")
    print("="*60)
    print(f"Loki URL: {loki_url}")
    print(f"Test Task: {TASK_NAME}")
    print("="*60)

    # Step 1: Check Loki connection
    print_step(1, "Check Loki Connection")
    if not check_loki_connection(loki_url):
        print("\n[ERROR] Cannot proceed without Loki connection")
        sys.exit(1)

    # Step 2: Send test log
    print_step(2, "Send Test ERROR Log")
    if not send_test_log(loki_url):
        print("\n[ERROR] Failed to send test log")
        sys.exit(1)

    # Wait a moment for indexing
    time.sleep(1)

    # Step 3: Verify task exists
    print_step(3, "Verify Task in Loki")
    check_task_exists(loki_url)

    # Step 4: Instructions
    print_step(4, "Configure Monitoring in Browser")
    print("\nFollow these steps EXACTLY:")
    print()
    print("  1. Open your browser to: http://localhost:8080")
    print()
    print("  2. Look for task 'test_alert' in the left sidebar task list")
    print("     (If you don't see it, click the refresh icon)")
    print()
    print(f"  3. RIGHT-CLICK on '{TASK_NAME}'")
    print()
    print("  4. Select '监控' (Watch) from the context menu")
    print()
    print(f"  5. The task '{TASK_NAME}' should now have a RED dot (●) next to it")
    print()
    print("  6. Open browser console (F12) and check for these messages:")
    print("     - 'WebSocket connected to batch-sync service'")
    print("     - 'ERROR log detected for watched task: test_alert'")
    print()

    # Step 5: Trigger alert
    print_step(5, "Trigger Alert")
    print("\nAfter completing Step 4, press Enter to send another ERROR log...")
    input()

    print("\nSending ERROR log to trigger alert...")
    if send_test_log(loki_url):
        print()
        print("="*60)
        print("SUCCESS!")
        print("="*60)
        print()
        print("You should now see:")
        print("  - Red gradient border flashing around the screen")
        print("  - Radial gradient background pulsing")
        print("  - Text in center: '点击屏幕关闭告警'")
        print()
        print("If you DON'T see the alert:")
        print()
        print("  1. Check browser console (F12) for errors")
        print("  2. Verify the task is monitored (RED dot)")
        print("  3. Check console for: 'ERROR log detected for watched task'")
        print()
        print("Common issues:")
        print("  - WebSocket not connected (check console)")
        print(f"  - Task '{TASK_NAME}' not in monitored list")
        print("  - Browser cache issue (try Ctrl+Shift+R)")
        print()
    else:
        print("\n[ERROR] Failed to send trigger log")


if __name__ == "__main__":
    main()
