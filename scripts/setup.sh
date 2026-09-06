#!/bin/bash

echo "🚀 Setting up EightChat development environment..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check prerequisites
echo -e "\n${YELLOW}Checking prerequisites...${NC}"

check_command() {
    if command -v $1 &> /dev/null; then
        echo -e "${GREEN}✅ $1 is installed${NC}"
    else
        echo -e "${RED}❌ $1 is NOT installed - Please install it first${NC}"
        exit 1
    fi
}

check_command node
check_command npm
check_command docker
check_command git
check_command pnpm

# Copy .env file
if [ ! -f .env ]; then
    cp .env.example .env
    echo -e "${GREEN}✅ Created .env file${NC}"
fi

# Install dependencies
echo -e "\n${YELLOW}Installing dependencies...${NC}"
pnpm install

# Start Docker services
echo -e "\n${YELLOW}Starting Docker services...${NC}"
docker compose up -d

# Wait for services to be healthy
echo -e "\n${YELLOW}Waiting for services to start...${NC}"
sleep 15

# Check services
echo -e "\n${YELLOW}Checking service status...${NC}"
docker compose ps

echo -e "\n${GREEN}✅ EightChat development environment is ready!${NC}"
echo -e "\n📊 Service URLs:"
echo -e "  API Server:     http://localhost:3000"
echo -e "  MinIO Console:  http://localhost:9001"
echo -e "  RabbitMQ UI:    http://localhost:15672"
echo -e "  Redis UI:       http://localhost:8081"
echo -e "  LibreTranslate: http://localhost:5000"