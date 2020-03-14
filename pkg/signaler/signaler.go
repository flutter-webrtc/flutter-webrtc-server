package signaler

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/cloudwebrtc/flutter-webrtc-server/pkg/logger"
	"github.com/cloudwebrtc/flutter-webrtc-server/pkg/turn"
	"github.com/cloudwebrtc/flutter-webrtc-server/pkg/util"
	"github.com/cloudwebrtc/flutter-webrtc-server/pkg/websocket"
)

const (
	sharedKey = `flutter-webrtc-turn-server-shared-key`
)

type TurnCredentials struct {
	Username string   `json:"username"`
	Password string   `json:"password"`
	TTL      int      `json:"ttl"`
	Uris     []string `json:"uris"`
}

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
	peers     map[string]Peer
	sessions  map[string]Session
	turn      *turn.TurnServer
	expresMap *util.ExpiredMap
}

func NewSignaler(turn *turn.TurnServer) *Signaler {
	var signaler = &Signaler{
		peers:     make(map[string]Peer),
		sessions:  make(map[string]Session),
		turn:      turn,
		expresMap: util.NewExpiredMap(),
	}
	signaler.turn.AuthHandler = signaler.authHandler
	return signaler
}

func (s Signaler) authHandler(username string, realm string, srcAddr net.Addr) ([]byte, bool) {
	// handle turn credential.
	if found, info := s.expresMap.Get(username); found {
		credential := info.(TurnCredentials)
		return []byte(credential.Password), true
	}
	return nil, false
}

// NotifyPeersUpdate .
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

// HandleTurnServerCredentials .
// https://tools.ietf.org/html/draft-uberti-behave-turn-rest-00
func (s *Signaler) HandleTurnServerCredentials(writer http.ResponseWriter, request *http.Request) {
	writer.Header().Set("Content-Type", "application/json")

	params, err := url.ParseQuery(request.URL.RawQuery)
	if err != nil {

	}
	logger.Debugf("%v", params)
	service := params["service"][0]
	if service != "turn" {
		return
	}
	username := params["username"][0]
	timestamp := time.Now().Unix()
	turnUsername := fmt.Sprintf("%d:%s", timestamp, username)
	hmac := hmac.New(sha1.New, []byte(sharedKey))
	hmac.Write([]byte(turnUsername))
	turnPassword := base64.StdEncoding.EncodeToString(hmac.Sum(nil))
	/*
		{
		     "username" : "12334939:mbzrxpgjys",
		     "password" : "adfsaflsjfldssia",
		     "ttl" : 86400,
		     "uris" : [
		       "turn:1.2.3.4:9991?transport=udp",
		       "turn:1.2.3.4:9992?transport=tcp",
		       "turns:1.2.3.4:443?transport=tcp"
			 ]
		}
		For client pc.
		var iceServer = {
			"username": response.username,
			"credential": response.password,
			"uris": response.uris
		};
		var config = {"iceServers": [iceServer]};
		var pc = new RTCPeerConnection(config);

	*/
	ttl := 86400
	host := fmt.Sprintf("%s:%d", s.turn.Config.PublicIP, s.turn.Config.Port)
	credential := TurnCredentials{
		Username: turnUsername,
		Password: turnPassword,
		TTL:      ttl,
		Uris: []string{
			"turn:" + host + "?transport=udp",
		},
	}
	s.expresMap.Set(turnUsername, credential, int64(ttl))
	json.NewEncoder(writer).Encode(credential)
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
