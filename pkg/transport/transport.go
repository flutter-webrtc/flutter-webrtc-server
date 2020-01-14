package transport

import (
	"errors"
	"sync"
	"time"

	"github.com/chuckpreslar/emission"
	"github.com/cloudwebrtc/flutter-webrtc-server/pkg/logger"
	"github.com/gorilla/websocket"
)

const pingPeriod = 5 * time.Second

type WebSocketTransport struct {
	emission.Emitter
	socket *websocket.Conn
	mutex  *sync.Mutex
	closed bool
}

func NewWebSocketTransport(socket *websocket.Conn) *WebSocketTransport {
	var transport WebSocketTransport
	transport.Emitter = *emission.NewEmitter()
	transport.socket = socket
	transport.mutex = new(sync.Mutex)
	transport.closed = false
	transport.socket.SetCloseHandler(func(code int, text string) error {
		logger.Warnf("%s [%d]", text, code)
		transport.Emit("close", code, text)
		transport.closed = true
		return nil
	})
	return &transport
}

func (transport *WebSocketTransport) ReadMessage() {
	in := make(chan []byte)
	stop := make(chan struct{})
	pingTicker := time.NewTicker(pingPeriod)

	var c = transport.socket
	go func() {
		for {
			_, message, err := c.ReadMessage()
			if err != nil {
				logger.Warnf("Got error: %v", err)
				if c, k := err.(*websocket.CloseError); k {
					transport.Emit("error", c.Code, c.Text)
				}
				close(stop)
				break
			}
			in <- message
		}
	}()

	for {
		select {
		case _ = <-pingTicker.C:
			logger.Infof("Send keepalive !!!")
			if err := transport.Send("{}"); err != nil {
				logger.Errorf("Keepalive has failed")
				pingTicker.Stop()
				return
			}
		case message := <-in:
			{
				logger.Infof("Recivied data: %s", message)
				transport.Emit("message", []byte(message))
			}
		case <-stop:
			return
		}
	}
}

/*
* Send |message| to the connection.
 */
func (transport *WebSocketTransport) Send(message string) error {
	logger.Infof("Send data: %s", message)
	transport.mutex.Lock()
	defer transport.mutex.Unlock()
	if transport.closed {
		return errors.New("websocket: write closed")
	}
	return transport.socket.WriteMessage(websocket.TextMessage, []byte(message))
}

/*
* Close connection.
 */
func (transport *WebSocketTransport) Close() {
	transport.mutex.Lock()
	defer transport.mutex.Unlock()
	if transport.closed == false {
		logger.Infof("Close ws transport now : ", transport)
		transport.socket.Close()
		transport.closed = true
	} else {
		logger.Warnf("Transport already closed :", transport)
	}
}
