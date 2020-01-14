package main

import (
	"github.com/cloudwebrtc/flutter-webrtc-server/pkg/signaler"
	"github.com/cloudwebrtc/flutter-webrtc-server/pkg/websocket"
)

func main() {
	signaler := signaler.NewSignaler()
	wsServer := websocket.NewWebSocketServer(signaler.HandleNewWebSocket)
	config := websocket.DefaultConfig()
	config.Port = 4443
	config.CertFile = "certs/cert.pem"
	config.KeyFile = "certs/key.pem"
	config.HTMLRoot = "html"
	wsServer.Bind(config)
}
