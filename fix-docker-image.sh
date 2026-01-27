#!/bin/bash
#############################################################################
# Clawdbot Docker Image Fix Script
#
# This script helps fix the Docker image issue by providing options to:
# 1. Use a different Docker image
# 2. Authenticate with GitHub Container Registry
# 3. Build from source (if applicable)
#
# Usage:
#   bash fix-docker-image.sh <option>
#
# Options:
#   1 - Update to a different Docker image
#   2 - Authenticate with GitHub Container Registry
#   3 - Show current configuration
#############################################################################

set -euo pipefail

CLAWDBOT_DIR="/home/clawdbot/clawdbot"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root (use sudo)"
   exit 1
fi

show_menu() {
    echo "=========================================="
    echo "Clawdbot Docker Image Fix"
    echo "=========================================="
    echo ""
    echo "1) Update to a different Docker image"
    echo "2) Authenticate with GitHub Container Registry"
    echo "3) Show current configuration"
    echo "4) Test Docker image pull"
    echo "5) Exit"
    echo ""
}

update_docker_image() {
    echo ""
    echo "Current image in docker-compose.yml:"
    grep "image:" "${CLAWDBOT_DIR}/docker-compose.yml" || echo "Not found"
    echo ""
    echo "Enter the new Docker image name (e.g., ghcr.io/username/clawdbot:latest):"
    read -r NEW_IMAGE
    
    if [[ -z "$NEW_IMAGE" ]]; then
        echo "Error: Image name cannot be empty"
        return 1
    fi
    
    echo "Updating docker-compose.yml..."
    sed -i "s|image:.*|image: ${NEW_IMAGE}|" "${CLAWDBOT_DIR}/docker-compose.yml"
    
    echo "Updated! New configuration:"
    grep "image:" "${CLAWDBOT_DIR}/docker-compose.yml"
    
    echo ""
    echo "Pulling new image..."
    cd "${CLAWDBOT_DIR}"
    su - clawdbot -c "cd ${CLAWDBOT_DIR} && docker-compose pull"
    
    echo ""
    echo "Restarting Clawdbot service..."
    systemctl restart clawdbot
    
    echo "Done! Check status with: systemctl status clawdbot"
}

authenticate_ghcr() {
    echo ""
    echo "GitHub Container Registry Authentication"
    echo "=========================================="
    echo ""
    echo "You will need:"
    echo "1. GitHub username"
    echo "2. GitHub Personal Access Token (PAT) with 'read:packages' scope"
    echo ""
    echo "Create a PAT at: https://github.com/settings/tokens"
    echo ""
    
    echo "Enter your GitHub username:"
    read -r GH_USERNAME
    
    echo "Enter your GitHub Personal Access Token:"
    read -rs GH_TOKEN
    echo ""
    
    if [[ -z "$GH_USERNAME" ]] || [[ -z "$GH_TOKEN" ]]; then
        echo "Error: Username and token are required"
        return 1
    fi
    
    echo "Authenticating with GitHub Container Registry..."
    echo "$GH_TOKEN" | docker login ghcr.io -u "$GH_USERNAME" --password-stdin
    
    if [[ $? -eq 0 ]]; then
        echo "Authentication successful!"
        echo ""
        echo "Now trying to pull the image..."
        cd "${CLAWDBOT_DIR}"
        su - clawdbot -c "cd ${CLAWDBOT_DIR} && docker-compose pull"
        
        echo ""
        echo "Restarting Clawdbot service..."
        systemctl restart clawdbot
        
        echo "Done! Check status with: systemctl status clawdbot"
    else
        echo "Authentication failed. Please check your credentials."
        return 1
    fi
}

show_config() {
    echo ""
    echo "Current Configuration"
    echo "=========================================="
    echo ""
    echo "Docker Compose file:"
    cat "${CLAWDBOT_DIR}/docker-compose.yml"
    echo ""
    echo "=========================================="
    echo ""
    echo "Clawdbot service status:"
    systemctl status clawdbot --no-pager || true
    echo ""
    echo "Docker containers:"
    docker ps -a | grep clawdbot || echo "No Clawdbot containers found"
}

test_image_pull() {
    echo ""
    echo "Current image in docker-compose.yml:"
    CURRENT_IMAGE=$(grep "image:" "${CLAWDBOT_DIR}/docker-compose.yml" | awk '{print $2}')
    echo "$CURRENT_IMAGE"
    echo ""
    echo "Testing pull..."
    docker pull "$CURRENT_IMAGE"
    
    if [[ $? -eq 0 ]]; then
        echo ""
        echo "✓ Image pull successful!"
        echo "Restarting Clawdbot service..."
        systemctl restart clawdbot
        echo "Done!"
    else
        echo ""
        echo "✗ Image pull failed. Options:"
        echo "  1. Use a different image (option 1)"
        echo "  2. Authenticate with registry (option 2)"
    fi
}

# Main menu loop
while true; do
    show_menu
    echo "Select an option (1-5):"
    read -r OPTION
    
    case $OPTION in
        1)
            update_docker_image
            ;;
        2)
            authenticate_ghcr
            ;;
        3)
            show_config
            ;;
        4)
            test_image_pull
            ;;
        5)
            echo "Exiting..."
            exit 0
            ;;
        *)
            echo "Invalid option. Please select 1-5."
            ;;
    esac
    
    echo ""
    echo "Press Enter to continue..."
    read -r
done
