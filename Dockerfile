FROM golang:1.13

WORKDIR /go/src/flutter-webrtc-server
COPY . .
RUN go get -d -v ./...
RUN go build

CMD ["/go/src/flutter-webrtc-server/cmd/server/main.go"]
