#!/bin/bash
# Install Bunkr backend as a systemd service

echo "Installing Bunkr backend as a systemd service..."

# Copy service file to systemd directory
sudo cp bunkr.service /etc/systemd/system/

# Reload systemd daemon
sudo systemctl daemon-reload

# Enable the service (start on boot)
sudo systemctl enable bunkr.service

# Start the service
sudo systemctl start bunkr.service

echo ""
echo "Bunkr backend service installed and started!"
echo ""
echo "Useful commands:"
echo "  sudo systemctl status bunkr   - Check service status"
echo "  sudo systemctl stop bunkr     - Stop the service"
echo "  sudo systemctl start bunkr    - Start the service"
echo "  sudo systemctl restart bunkr  - Restart the service"
echo "  sudo journalctl -u bunkr -f   - View live logs"
echo "  sudo systemctl disable bunkr  - Disable autostart"
echo ""
