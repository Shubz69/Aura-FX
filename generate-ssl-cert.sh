#!/bin/bash

# Script to generate self-signed SSL certificates for local development

# Create ssl directory if it doesn't exist
mkdir -p ssl

# Generate a self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/key.pem -out ssl/cert.pem \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost" \
  -addext "subjectAltName = DNS:localhost,IP:127.0.0.1"

echo "Self-signed SSL certificate generated successfully!"
echo "Certificate: ssl/cert.pem"
echo "Private key: ssl/key.pem"
echo "Valid for: 365 days"
echo ""
echo "Note: These are self-signed certificates for development only."
echo "For production, use certificates from a trusted CA." 