package websocket

import (
	"net/http"
	"strconv"

	"github.com/cloudwebrtc/flutter-webrtc-server/pkg/logger"
	"github.com/cloudwebrtc/flutter-webrtc-server/pkg/transport"
	"github.com/gorilla/websocket"
)

type WebSocketServerConfig struct {
	Host          string
	Port          int
	CertFile      string
	KeyFile       string
	HTMLRoot      string
	WebSocketPath string
}

func DefaultConfig() WebSocketServerConfig {
	return WebSocketServerConfig{
		Host:          "0.0.0.0",
		Port:          8086,
		HTMLRoot:      "html",
		WebSocketPath: "/ws",
	}
}

type WebSocketServer struct {
	handleWebSocket func(ws *transport.WebSocketTransport, request *http.Request)
	// Websocket upgrader
	upgrader websocket.Upgrader
}

func NewWebSocketServer(handler func(ws *transport.WebSocketTransport, request *http.Request)) *WebSocketServer {
	var server = &WebSocketServer{
		handleWebSocket: handler,
	}
	server.upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}
	return server
}

func (server *WebSocketServer) handleWebSocketRequest(writer http.ResponseWriter, request *http.Request) {
	responseHeader := http.Header{}
	//responseHeader.Add("Sec-WebSocket-Protocol", "protoo")
	socket, err := server.upgrader.Upgrade(writer, request, responseHeader)
	if err != nil {
		panic(err)
	}
	wsTransport := transport.NewWebSocketTransport(socket)
	server.handleWebSocket(wsTransport, request)
	wsTransport.ReadMessage()
}

// Bind .
func (server *WebSocketServer) Bind(cfg WebSocketServerConfig) {
	// Websocket handle func
	http.HandleFunc(cfg.WebSocketPath, server.handleWebSocketRequest)
	http.Handle("/", http.FileServer(http.Dir(cfg.HTMLRoot)))
	logger.Infof("WebSocketServer listening on: %s:%d", cfg.Host, cfg.Port)
	// http.ListenAndServe(cfg.Host+":"+strconv.Itoa(cfg.Port), nil)
	panic(http.ListenAndServeTLS(cfg.Host+":"+strconv.Itoa(cfg.Port), cfg.CertFile, cfg.KeyFile, nil))
}
