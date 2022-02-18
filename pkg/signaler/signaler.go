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

	"github.com/flutter-webrtc/flutter-webrtc-server/pkg/logger"
	"github.com/flutter-webrtc/flutter-webrtc-server/pkg/turn"
	"github.com/flutter-webrtc/flutter-webrtc-server/pkg/util"
	"github.com/flutter-webrtc/flutter-webrtc-server/pkg/websocket"
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

type Method string

const (
	New       Method = "new"
	Bye       Method = "bye"
	Offer     Method = "offer"
	Answer    Method = "answer"
	Candidate Method = "candidate"
	Leave     Method = "leave"
	Keepalive Method = "keepalive"
)

type Request struct {
	Type Method      `json:"type"`
	Data interface{} `json:"data"`
}

type PeerInfo struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	UserAgent string `json:"user_agent"`
}

type Negotiation struct {
	From      string `json:"from"`
	To        string `json:"to"`
	SessionID string `json:"session_id"`
}

type Byebye struct {
	SessionID string `json:"session_id"`
	From      string `json:"from"`
}

type Error struct {
	Request string `json:"request"`
	Reason  string `json:"reason"`
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

func (s Signaler) authHandler(username string, realm string, srcAddr net.Addr) (string, bool) {
	// handle turn credential.
	if found, info := s.expresMap.Get(username); found {
		credential := info.(TurnCredentials)
		return credential.Password, true
	}
	return "", false
}

// NotifyPeersUpdate .
func (s *Signaler) NotifyPeersUpdate(conn *websocket.WebSocketConn, peers map[string]Peer) {
	infos := []PeerInfo{}
	for _, peer := range peers {
		infos = append(infos, peer.info)
	}

	request := Request{
		Type: "peers",
		Data: infos,
	}
	for _, peer := range peers {
		s.Send(peer.conn, request)
	}
}

// HandleTurnServerCredentials .
// https://tools.ietf.org/html/draft-uberti-behave-turn-rest-00
func (s *Signaler) HandleTurnServerCredentials(writer http.ResponseWriter, request *http.Request) {
	writer.Header().Set("Content-Type", "application/json")
	writer.Header().Set("Access-Control-Allow-Origin", "*")

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
	turnPassword := base64.RawStdEncoding.EncodeToString(hmac.Sum(nil))
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

func (s *Signaler) Send(conn *websocket.WebSocketConn, m interface{}) error {
	data, err := json.Marshal(m)
	if err != nil {
		logger.Errorf(err.Error())
		return err
	}
	return conn.Send(string(data))
}

func (s *Signaler) HandleNewWebSocket(conn *websocket.WebSocketConn, request *http.Request) {
	logger.Infof("On Open %v", request)
	conn.On("message", func(message []byte) {
		logger.Infof("On message %v", string(message))
		var body json.RawMessage
		request := Request{
			Data: &body,
		}
		err := json.Unmarshal(message, &request)
		if err != nil {
			logger.Errorf("Unmarshal error %v", err)
			return
		}

		var data map[string]interface{}
		err = json.Unmarshal(body, &data)
		if err != nil {
			logger.Errorf("Unmarshal error %v", err)
			return
		}

		switch request.Type {
		case New:
			var info PeerInfo
			err := json.Unmarshal(body, &info)
			if err != nil {
				logger.Errorf("Unmarshal login error %v", err)
				return
			}
			s.peers[info.ID] = Peer{
				conn: conn,
				info: info,
			}
			s.NotifyPeersUpdate(conn, s.peers)
			break
		case Leave:
		case Offer:
			fallthrough
		case Answer:
			fallthrough
		case Candidate:
			{
				var negotiation Negotiation
				err := json.Unmarshal(body, &negotiation)
				if err != nil {
					logger.Errorf("Unmarshal "+string(request.Type)+" got error %v", err)
					return
				}
				to := negotiation.To
				peer, ok := s.peers[to]
				if !ok {
					msg := Request{
						Type: "error",
						Data: Error{
							Request: string(request.Type),
							Reason:  "Peer [" + to + "] not found ",
						},
					}
					s.Send(conn, msg)
					return
				}
				s.Send(peer.conn, request)
			}
			break
		case Bye:
			var bye Byebye
			err := json.Unmarshal(body, &bye)
			if err != nil {
				logger.Errorf("Unmarshal bye got error %v", err)
				return
			}

			ids := strings.Split(bye.SessionID, "-")
			if len(ids) != 2 {
				msg := Request{
					Type: "error",
					Data: Error{
						Request: string(request.Type),
						Reason:  "Invalid session [" + bye.SessionID + "]",
					},
				}
				s.Send(conn, msg)
				return
			}

			sendBye := func(id string) {
				peer, ok := s.peers[id]

				if !ok {
					msg := Request{
						Type: "error",
						Data: Error{
							Request: string(request.Type),
							Reason:  "Peer [" + id + "] not found.",
						},
					}
					s.Send(conn, msg)
					return
				}
				bye := Request{
					Type: "bye",
					Data: map[string]interface{}{
						"to":         id,
						"session_id": bye.SessionID,
					},
				}
				s.Send(peer.conn, bye)
			}

			// send to aleg
			sendBye(ids[0])
			//send to bleg
			sendBye(ids[1])

		case Keepalive:
			s.Send(conn, request)
		default:
			logger.Warnf("Unkown request %v", request)
		}
	})

	conn.On("close", func(code int, text string) {
		logger.Infof("On Close %v", conn)
		var peerID string = ""

		for _, peer := range s.peers {
			if peer.conn == conn {
				peerID = peer.info.ID
			} else {
				leave := Request{
					Type: "leave",
					Data: peer.info.ID,
				}
				s.Send(peer.conn, leave)
			}
		}

		logger.Infof("Remove peer %s", peerID)
		if peerID == "" {
			logger.Infof("Leve peer id not found")
			return
		}
		delete(s.peers, peerID)

		s.NotifyPeersUpdate(conn, s.peers)
	})
}
