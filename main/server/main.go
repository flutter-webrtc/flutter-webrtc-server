package main

import (
	"github.com/cloudwebrtc/flutter-webrtc-server/pkg/signaler"
	"github.com/cloudwebrtc/flutter-webrtc-server/pkg/turn"
	"github.com/cloudwebrtc/flutter-webrtc-server/pkg/websocket"
)

func main() {
	turnConfig := turn.DefaultConfig()
	turnConfig.PublicIP = "123.45.67.89"
	turnConfig.Port = 19302
	turnConfig.Realm = "flutter-webrtc"
	turn := turn.NewTurnServer(turnConfig)

	signaler := signaler.NewSignaler(turn)
	wsServer := websocket.NewWebSocketServer(signaler.HandleNewWebSocket, signaler.HandleTurnServerCredentials)

	config := websocket.DefaultConfig()
	config.Port = 4443
	config.CertFile = "certs/cert.pem"
	config.KeyFile = "certs/key.pem"
	config.HTMLRoot = "html"

	wsServer.Bind(config)
}
