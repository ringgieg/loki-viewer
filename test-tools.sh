#!/bin/sh
#
# Test script to verify all required tools are installed
#

echo "================================"
echo "Testing installed tools..."
echo "================================"
echo

# Test Python
echo "1. Testing Python..."
if command -v python3 >/dev/null 2>&1; then
    python3 --version
    echo "   ✓ Python3 installed"
else
    echo "   ✗ Python3 NOT found"
fi

if command -v python >/dev/null 2>&1; then
    python --version
    echo "   ✓ Python symlink created"
else
    echo "   ✗ Python symlink NOT found"
fi
echo

# Test pip
echo "2. Testing pip..."
if command -v pip3 >/dev/null 2>&1; then
    pip3 --version
    echo "   ✓ pip3 installed"
else
    echo "   ✗ pip3 NOT found"
fi

if command -v pip >/dev/null 2>&1; then
    pip --version
    echo "   ✓ pip symlink created"
else
    echo "   ✗ pip symlink NOT found"
fi
echo

# Test requests library
echo "3. Testing Python requests library..."
if python3 -c "import requests; print(f'   ✓ requests {requests.__version__} installed')" 2>/dev/null; then
    :
else
    echo "   ✗ requests library NOT found"
fi
echo

# Test utilities
echo "4. Testing utilities..."
for cmd in curl wget traceroute ping nslookup vim jq; do
    if command -v $cmd >/dev/null 2>&1; then
        version=$($cmd --version 2>&1 | head -n 1 || echo "installed")
        echo "   ✓ $cmd: $version"
    else
        echo "   ✗ $cmd NOT found"
    fi
done
echo

echo "================================"
echo "All tests completed!"
echo "================================"
