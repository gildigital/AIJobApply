#!/bin/bash

# First log in to get a session cookie
echo "Logging in..."
LOGIN_RESPONSE=$(curl -s -c cookies.txt -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"gildigital","password":"Hackathon123!"}')

echo "Login response: $LOGIN_RESPONSE"

# Now get the application stats using the cookie
echo "Fetching application statistics..."
STATS_RESPONSE=$(curl -s -b cookies.txt http://localhost:5000/api/application-stats)

echo "Application Statistics:"
echo "$STATS_RESPONSE" | jq .

# Clean up
rm cookies.txt