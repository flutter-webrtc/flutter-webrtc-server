#build stage
FROM golang:alpine AS builder
RUN apk add --no-cache git
WORKDIR /app
COPY . .
RUN CGO_ENABLE=0 GOOS=linux GOARCH=amd64 go build -o bin/server-linux-amd64 -ldflags "-s -w" cmd/server/main.go


#final stage
FROM alpine:latest
RUN apk --no-cache add ca-certificates
COPY --from=builder /app/bin/server-linux-amd64 /app
COPY ./configs ./configs
LABEL Name=flutterwebrtcserver Version=0.0.1
EXPOSE 8086
ENTRYPOINT /app
CMD [ "/app/server-linux-amd64" ]
