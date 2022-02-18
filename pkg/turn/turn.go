package turn

import (
	"net"
	"strconv"

	"github.com/flutter-webrtc/flutter-webrtc-server/pkg/logger"
	"github.com/pion/turn/v2"
)

type TurnServerConfig struct {
	PublicIP string
	Port     int
	Realm    string
}

func DefaultConfig() TurnServerConfig {
	return TurnServerConfig{
		PublicIP: "127.0.0.1",
		Port:     19302,
		Realm:    "flutter-webrtc",
	}
}

/*
if key, ok := usersMap[username]; ok {
				return key, true
			}
			return nil, false
*/

type TurnServer struct {
	udpListener net.PacketConn
	turnServer  *turn.Server
	Config      TurnServerConfig
	AuthHandler func(username string, realm string, srcAddr net.Addr) (string, bool)
}

func NewTurnServer(config TurnServerConfig) *TurnServer {
	server := &TurnServer{
		Config:      config,
		AuthHandler: nil,
	}
	if len(config.PublicIP) == 0 {
		logger.Panicf("'public-ip' is required")
	}
	udpListener, err := net.ListenPacket("udp4", "0.0.0.0:"+strconv.Itoa(config.Port))
	if err != nil {
		logger.Panicf("Failed to create TURN server listener: %s", err)
	}
	server.udpListener = udpListener

	turnServer, err := turn.NewServer(turn.ServerConfig{
		Realm:       config.Realm,
		AuthHandler: server.HandleAuthenticate,
		PacketConnConfigs: []turn.PacketConnConfig{
			{
				PacketConn: udpListener,
				RelayAddressGenerator: &turn.RelayAddressGeneratorStatic{
					RelayAddress: net.ParseIP(config.PublicIP),
					Address:      "0.0.0.0",
				},
			},
		},
	})
	if err != nil {
		logger.Panicf("%v", err)
	}
	server.turnServer = turnServer
	return server
}

func (s *TurnServer) HandleAuthenticate(username string, realm string, srcAddr net.Addr) ([]byte, bool) {
	if s.AuthHandler != nil {
		if password, ok := s.AuthHandler(username, realm, srcAddr); ok {
			return turn.GenerateAuthKey(username, realm, password), true
		}
	}
	return nil, false
}

func (s *TurnServer) Close() error {
	return s.turnServer.Close()
}
