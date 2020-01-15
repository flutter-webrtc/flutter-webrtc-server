package signaler

import (
	"encoding/json"
	"net"
	"net/http"
	"strings"

	"github.com/cloudwebrtc/flutter-webrtc-server/pkg/logger"
	"github.com/cloudwebrtc/flutter-webrtc-server/pkg/turn"
	"github.com/cloudwebrtc/flutter-webrtc-server/pkg/websocket"
)

func Marshal(m map[string]interface{}) string {
	if byt, err := json.Marshal(m); err != nil {
		logger.Errorf(err.Error())
		return ""
	} else {
		return string(byt)
	}
}

func Unmarshal(str string) map[string]interface{} {
	var data map[string]interface{}
	if err := json.Unmarshal([]byte(str), &data); err != nil {
		logger.Errorf(err.Error())
		return data
	}
	return data
}

// PeerInfo .
type PeerInfo struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	UserAgent string `json:"user_agent"`
}

// Peer .
type Peer struct {
	info PeerInfo
	conn *websocket.WebSocketConn
}

// Session info.
type Session struct {
	id   string
	from Peer
	to   Peer
}

type Signaler struct {
	peers    map[string]Peer
	sessions map[string]Session
	turn     *turn.TurnServer
}

func NewSignaler(turn *turn.TurnServer) *Signaler {
	var signaler = &Signaler{
		peers:    make(map[string]Peer),
		sessions: make(map[string]Session),
		turn:     turn,
	}
	signaler.turn.AuthHandler = signaler.authHandler
	return signaler
}

func (s Signaler) authHandler(username string, realm string, srcAddr net.Addr) ([]byte, bool) {
	// handle turn auth info.
	return nil, false
}

func (s *Signaler) NotifyPeersUpdate(conn *websocket.WebSocketConn, peers map[string]Peer) {
	infos := []PeerInfo{}
	for _, peer := range peers {
		infos = append(infos, peer.info)
	}
	request := make(map[string]interface{})
	request["type"] = "peers"
	request["data"] = infos
	for _, peer := range peers {
		peer.conn.Send(Marshal(request))
	}
}

func (s *Signaler) HandleTurnServerCredentials(writer http.ResponseWriter, request *http.Request) {
	// return turn credentials for client.
}

func (s *Signaler) HandleNewWebSocket(conn *websocket.WebSocketConn, request *http.Request) {
	logger.Infof("On Open %v", request)
	conn.On("message", func(message []byte) {
		request := Unmarshal(string(message))
		data := request["data"].(map[string]interface{})
		switch request["type"] {
		case "new":
			{

				peer := Peer{
					conn: conn,
					info: PeerInfo{
						ID:        data["id"].(string),
						Name:      data["name"].(string),
						UserAgent: data["user_agent"].(string),
					},
				}
				s.peers[peer.info.ID] = peer
				s.NotifyPeersUpdate(conn, s.peers)
			}
			break
		case "leave":
			{

			}
			break
		case "offer":
			fallthrough
		case "answer":
			fallthrough
		case "candidate":
			{
				To := data["to"].(string)
				if peer, ok := s.peers[To]; !ok {
					msg := map[string]interface{}{
						"type": "error",
						"data": map[string]interface{}{
							"request": request["type"],
							"reason":  "Peer [" + To + "] not found ",
						},
					}
					conn.Send(Marshal(msg))
					return
				} else {
					peer.conn.Send(Marshal(request))
				}
			}
			break
		case "bye":
			{
				sessionID := data["session_id"].(string)
				ids := strings.Split(sessionID, "-")
				if len(ids) != 2 {
					msg := map[string]interface{}{
						"type": "error",
						"data": map[string]interface{}{
							"request": request["type"],
							"reason":  "Invalid session [" + sessionID + "]",
						},
					}
					conn.Send(Marshal(msg))
					return
				}
				if peer, ok := s.peers[ids[0]]; !ok {
					msg := map[string]interface{}{
						"type": "error",
						"data": map[string]interface{}{
							"request": request["type"],
							"reason":  "Peer [" + ids[0] + "] not found.",
						},
					}
					conn.Send(Marshal(msg))
					return
				} else {
					bye := map[string]interface{}{
						"type": "bye",
						"data": map[string]interface{}{
							"to":         ids[0],
							"session_id": sessionID,
						},
					}
					peer.conn.Send(Marshal(bye))
				}

				if peer, ok := s.peers[ids[1]]; !ok {
					msg := map[string]interface{}{
						"type": "error",
						"data": map[string]interface{}{
							"request": request["type"],
							"reason":  "Peer [" + ids[0] + "] not found ",
						},
					}
					conn.Send(Marshal(msg))
					return
				} else {
					bye := map[string]interface{}{
						"type": "bye",
						"data": map[string]interface{}{
							"to":         ids[1],
							"session_id": sessionID,
						},
					}
					peer.conn.Send(Marshal(bye))
				}
			}
			break
		case "keepalive":
			keepalive := map[string]interface{}{
				"type": "keepalive",
				"data": map[string]interface{}{},
			}
			conn.Send(Marshal(keepalive))
			break
		default:
			{
				logger.Warnf("Unkown request %v", request)
			}
			break
		}
	})

	conn.On("close", func(code int, text string) {
		logger.Infof("On Close %v", conn)
		for _, peer := range s.peers {
			if peer.conn == conn {
				logger.Infof("Remove peer %s", peer.info.ID)
				delete(s.peers, peer.info.ID)
				break
			}
		}
		s.NotifyPeersUpdate(conn, s.peers)
	})
}
