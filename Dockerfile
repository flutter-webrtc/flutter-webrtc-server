# Use an official Golang image as a base# Use an official Golang image as a base
FROM golang:latest

# Set the working directory
WORKDIR /app

# Copy the local repository files to the Docker container
COPY . /app

# Copy the pre-generated certificates from the host
COPY configs/certs/key.pem /app/configs/certs/key.pem
COPY configs/certs/cert.pem /app/configs/certs/cert.pem

# Run the Go server
CMD ["go", "run", "cmd/server/main.go"]

# Expose the port
EXPOSE 8086