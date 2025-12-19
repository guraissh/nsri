#!/bin/bash

# NSRI Docker Quick Start Script
# This script helps you get NSRI up and running with Docker

set -e

echo "╔════════════════════════════════════════╗"
echo "║   NSRI Docker Setup & Start            ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed!"
    echo "Please install Docker from: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed!"
    echo "Please install Docker Compose from: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker is installed"
echo ""

# Check if .env exists, create from example if not
if [ ! -f .env ]; then
    echo "📝 Creating .env from .env.example..."
    cp .env.example .env
    echo "⚠️  Please edit .env to set your LOCAL_MEDIA_PATH if needed"
    echo ""
fi

# Ask user what to do
echo "What would you like to do?"
echo "  1) Start services (build if needed)"
echo "  2) Rebuild and start services"
echo "  3) Stop services"
echo "  4) View logs"
echo "  5) Clean everything (including volumes)"
echo ""
read -p "Enter choice [1-5]: " choice

case $choice in
    1)
        echo ""
        echo "🚀 Starting NSRI services..."
        docker compose up -d
        echo ""
        echo "✅ Services started!"
        ;;
    2)
        echo ""
        echo "🔨 Rebuilding and starting services..."
        docker compose up -d --build
        echo ""
        echo "✅ Services rebuilt and started!"
        ;;
    3)
        echo ""
        echo "🛑 Stopping services..."
        docker compose down
        echo ""
        echo "✅ Services stopped!"
        exit 0
        ;;
    4)
        echo ""
        echo "📋 Showing logs (Ctrl+C to exit)..."
        docker compose logs -f
        exit 0
        ;;
    5)
        echo ""
        echo "⚠️  WARNING: This will delete all cached videos and data!"
        read -p "Are you sure? (yes/no): " confirm
        if [ "$confirm" = "yes" ]; then
            echo "🗑️  Cleaning everything..."
            docker compose down -v
            echo "✅ Everything cleaned!"
        else
            echo "❌ Cancelled"
        fi
        exit 0
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

# Wait for services to be healthy
echo ""
echo "⏳ Waiting for services to be ready..."
sleep 5

# Check service health
echo ""
echo "📊 Service Status:"
docker compose ps

echo ""
echo "✅ NSRI is ready!"
echo ""
echo "🌐 Access URLs:"
echo "   NSRI Frontend:  http://localhost:3000"
echo "   Bunkr API:      http://localhost:8001"
echo "   RedGifs API:    http://localhost:8000"
echo ""
echo "📖 For more information, see README.docker.md"
echo ""
echo "💡 Quick commands:"
echo "   View logs:      docker compose logs -f"
echo "   Stop services:  docker compose down"
echo "   Restart:        docker compose restart"
echo ""
