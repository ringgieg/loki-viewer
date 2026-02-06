#!/usr/bin/env python3
"""
Debug Alert Script
Helps diagnose why alerts are not triggering
"""

import requests
import time
import sys
from datetime import datetime

DEFAULT_VMLOG_URL = "http://127.0.0.1:9428"
DEFAULT_PUSH_PATH = "/insert/loki/api/v1/push"
TASK_NAME = "test_alert"


def _session_no_proxy():
    """Create a requests session that ignores system proxy env vars."""
    s = requests.Session()
    s.trust_env = False
    return s


def print_step(step_num, message):
    """Print a numbered step"""
    print(f"\n{'='*60}")
    print(f"STEP {step_num}: {message}")
    print(f"{'='*60}")


def check_vmlog_connection(vmlog_url):
    """Check if VictoriaLogs (vmlog) is accessible."""
    try:
        response = _session_no_proxy().get(f"{vmlog_url.rstrip('/')}/metrics", timeout=3)
        if response.status_code == 200:
            print(f"[OK] vmlog is running at {vmlog_url}")
            return True
        else:
            print(f"[FAIL] vmlog responded with status {response.status_code}")
            return False
    except Exception as e:
        print(f"[FAIL] Cannot connect to vmlog: {e}")
        return False


def send_test_log(vmlog_url, push_path=DEFAULT_PUSH_PATH):
    """Send a test ERROR log to vmlog."""
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


def check_task_exists(vmlog_url):
    """Check if the test task exists in vmlog via LogsQL stream_field_values."""
    try:
        body = {
            "query": "{job=\"tasks\",service=\"Batch-Sync\"}",
            "field": "task_name",
            "start": "30d",
            "end": "now",
            "limit": "2000",
        }

        response = _session_no_proxy().post(
            f"{vmlog_url.rstrip('/')}/select/logsql/stream_field_values",
            data=body,
            timeout=5,
        )
        if response.status_code == 200:
            data = response.json()
            tasks = [v.get("value") for v in data.get("values", [])]
            if TASK_NAME in tasks:
                print(f"[OK] Task '{TASK_NAME}' exists in vmlog")
                return True
            else:
                print(f"[INFO] Task '{TASK_NAME}' not found yet")
                if tasks:
                    print(f"       Available tasks (first 5): {', '.join(tasks[:5])}")
                return False
        else:
            print(f"[FAIL] Cannot fetch tasks: HTTP {response.status_code}")
            return False
    except Exception as e:
        print(f"[FAIL] Error checking tasks: {e}")
        return False


def main():
    vmlog_url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_VMLOG_URL
    push_path = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_PUSH_PATH

    print("\n" + "="*60)
    print("Alert Overlay Debug Tool")
    print("="*60)
    print(f"vmlog URL: {vmlog_url}")
    print(f"Push Path: {push_path}")
    print(f"Test Task: {TASK_NAME}")
    print("="*60)

    # Step 1: Check Loki connection
    print_step(1, "Check vmlog Connection")
    if not check_vmlog_connection(vmlog_url):
        print("\n[ERROR] Cannot proceed without vmlog connection")
        sys.exit(1)

    # Step 2: Send test log
    print_step(2, "Send Test ERROR Log")
    if not send_test_log(vmlog_url, push_path=push_path):
        print("\n[ERROR] Failed to send test log")
        sys.exit(1)

    # Wait a moment for indexing
    time.sleep(1)

    # Step 3: Verify task exists
    print_step(3, "Verify Task in vmlog")
    check_task_exists(vmlog_url)

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
    if send_test_log(vmlog_url, push_path=push_path):
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
