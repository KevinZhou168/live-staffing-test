#!/bin/bash

# Pre-Deployment Testing Script
# Run this before deploying to production

echo "======================================"
echo "IBC Draft System - Pre-Deployment Test"
echo "======================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

# Function to print test results
pass_test() {
    echo -e "${GREEN}✓ PASS${NC}: $1"
    ((PASSED++))
}

fail_test() {
    echo -e "${RED}✗ FAIL${NC}: $1"
    ((FAILED++))
}

warn_test() {
    echo -e "${YELLOW}⚠ WARNING${NC}: $1"
}

echo "1. Testing file syntax..."
echo "-----------------------------------"

# Check for Node.js
if command -v node &> /dev/null; then
    pass_test "Node.js is installed"
else
    fail_test "Node.js is not installed"
    exit 1
fi

# Check syntax of modified files
echo "Checking server.js syntax..."
node -c server.js 2>/dev/null
if [ $? -eq 0 ]; then
    pass_test "server.js syntax is valid"
else
    fail_test "server.js has syntax errors"
fi

echo "Checking socketHandler.js syntax..."
node -c server/logic/socketHandler.js 2>/dev/null
if [ $? -eq 0 ]; then
    pass_test "socketHandler.js syntax is valid"
else
    fail_test "socketHandler.js has syntax errors"
fi

echo ""
echo "2. Testing environment setup..."
echo "-----------------------------------"

# Check for required environment variables
if [ -f .env ]; then
    pass_test ".env file exists"
    
    # Check for critical env vars
    if grep -q "JOIN_CODE" .env; then
        pass_test "JOIN_CODE is set"
    else
        fail_test "JOIN_CODE not found in .env"
    fi
    
    if grep -q "SHEET_HISTORY_URL" .env; then
        pass_test "SHEET_HISTORY_URL is set"
    else
        warn_test "SHEET_HISTORY_URL not found (Google Sheets may not work)"
    fi
    
    if grep -q "PG_HOST" .env; then
        pass_test "PostgreSQL config found"
    else
        fail_test "PostgreSQL config not found in .env"
    fi
else
    fail_test ".env file not found"
fi

echo ""
echo "3. Testing dependencies..."
echo "-----------------------------------"

# Check if node_modules exists
if [ -d "node_modules" ]; then
    pass_test "node_modules directory exists"
else
    warn_test "node_modules not found - run 'npm install'"
fi

# Check for critical packages
if [ -f "package.json" ]; then
    pass_test "package.json exists"
    
    # Check for Socket.IO
    if grep -q "socket.io" package.json; then
        pass_test "socket.io dependency found"
    else
        fail_test "socket.io not found in package.json"
    fi
    
    # Check for Express
    if grep -q "express" package.json; then
        pass_test "express dependency found"
    else
        fail_test "express not found in package.json"
    fi
else
    fail_test "package.json not found"
fi

echo ""
echo "4. Testing data directory structure..."
echo "-----------------------------------"

# Check for data files
if [ -d "server/data" ]; then
    pass_test "server/data directory exists"
    
    # Check if data files exist (they'll be overwritten anyway)
    if [ -f "server/data/projects.js" ]; then
        pass_test "projects.js exists"
    else
        warn_test "projects.js will be created on first draft"
    fi
    
    if [ -f "server/data/consultants.js" ]; then
        pass_test "consultants.js exists"
    else
        warn_test "consultants.js will be created on first draft"
    fi
else
    fail_test "server/data directory not found"
fi

echo ""
echo "5. Testing database connection..."
echo "-----------------------------------"

# Try to connect to database if psql is available
if command -v psql &> /dev/null; then
    if [ -f .env ]; then
        # Source .env
        export $(cat .env | grep -v '#' | xargs)
        
        # Try to connect
        PGPASSWORD=$PG_PASSWORD psql -h $PG_HOST -U $PG_USER -d $PG_DB -c "SELECT 1;" &> /dev/null
        if [ $? -eq 0 ]; then
            pass_test "Database connection successful"
            
            # Check for required tables
            TABLES=$(PGPASSWORD=$PG_PASSWORD psql -h $PG_HOST -U $PG_USER -d $PG_DB -t -c "SELECT tablename FROM pg_tables WHERE schemaname='public';")
            
            if echo "$TABLES" | grep -q "projects"; then
                pass_test "projects table exists"
            else
                fail_test "projects table not found"
            fi
            
            if echo "$TABLES" | grep -q "consultants"; then
                pass_test "consultants table exists"
            else
                fail_test "consultants table not found"
            fi
            
            if echo "$TABLES" | grep -q "users"; then
                pass_test "users table exists"
            else
                fail_test "users table not found"
            fi
        else
            fail_test "Could not connect to database"
        fi
    else
        warn_test "Cannot test database without .env file"
    fi
else
    warn_test "psql not installed - skipping database connection test"
fi

echo ""
echo "6. Code quality checks..."
echo "-----------------------------------"

# Check for potentially blocking code patterns in socketHandler
if grep "await postToGoogleSheet" server/logic/socketHandler.js | grep -v "//" > /dev/null; then
    fail_test "Found blocking postToGoogleSheet calls (should be queued)"
else
    pass_test "No blocking Google Sheets calls in socketHandler"
fi

# Check if background file write function exists
if grep -q "writeDataFilesAndPostToSheets" server.js; then
    pass_test "Background file write function found in server.js"
else
    fail_test "Background file write function missing"
fi

# Check if Google Sheets queue is implemented
if grep -q "sheetQueue" server/logic/socketHandler.js; then
    pass_test "Google Sheets queue implementation found"
else
    fail_test "Google Sheets queue not found - critical fix missing"
fi

# Check if mutex is implemented
if grep -q "isProcessingPick" server/logic/socketHandler.js; then
    pass_test "Pick processing mutex found"
else
    fail_test "Pick mutex not found - race conditions possible"
fi

# Check if state reset exists
if grep -q "draftState.reset()" server/logic/socketHandler.js; then
    pass_test "State reset on startup found"
else
    fail_test "State reset missing - phantom drafters may persist"
fi

# Check if data validation exists
if grep -q "No consultants loaded" server/logic/socketHandler.js; then
    pass_test "Data validation checks found"
else
    warn_test "Data validation may not be implemented"
fi

echo ""
echo "======================================"
echo "Test Summary"
echo "======================================"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All critical tests passed!${NC}"
    echo "Ready for deployment testing."
    echo ""
    echo "Next steps:"
    echo "1. Start the server: npm start (or pm2 start server.js)"
    echo "2. Watch for: '🔄 Initializing socket handlers - resetting draft state'"
    echo "3. Test with 3+ users making rapid picks"
    echo "4. Monitor for 'Flushing X queued sheet updates' in logs"
    echo "5. Verify Google Sheets updates (may be delayed 2s)"
    exit 0
else
    echo -e "${RED}✗ Some tests failed.${NC}"
    echo "Please fix the issues above before deploying."
    exit 1
fi
