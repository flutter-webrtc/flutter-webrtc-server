import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { MuiThemeProvider, createMuiTheme } from '@material-ui/core/styles';
import { withStyles } from '@material-ui/core/styles';
import AppBar from '@material-ui/core/AppBar';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import Button from '@material-ui/core/Button';
import IconButton from '@material-ui/core/IconButton';
import MenuIcon from '@material-ui/icons/Menu';
import blue from '@material-ui/core/colors/blue';

var socket;


var RTCPeerConnection;
var RTCSessionDescription;


var pcPeers = {};
var selfView;
var remoteView;
var localStream;
var configuration;


const theme = createMuiTheme({
  palette: {
    primary: blue,
  },
});

export default class App extends Component {

  componentDidMount = () => {

    remoteView = this.refs['remoteView'];
    selfView = this.refs['selfView'];

    RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection || window.msRTCPeerConnection;
    RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription || window.msRTCSessionDescription;
    navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia || navigator.msGetUserMedia;

    var twilioIceServers = [
      { url: 'stun:global.stun.twilio.com:3478?transport=udp' }
    ];
    configuration = { "iceServers": [{ "url": "stun:stun.l.google.com:19302" }] };


    socket = new WebSocket('wss://localhost:4443');
    socket.onopen = () => {
      console.log("wss connect success...");
      this.getLocalStream();
    };

    socket.onmessage = (e) => {

      var parsedMessage = JSON.parse(e.data);

      console.info('Received message: ' + parsedMessage.type);
      console.info('Received message data: ' + parsedMessage.data);

      switch (parsedMessage.type) {
        case 'join':
            this.onJoin(parsedMessage);
          break;
          case 'exchange':
            this.exchange(parsedMessage);
          break;
          case 'leave':
            var sessionId = JSON.parse(parsedMessage.data);
            this.leave(sessionId);
          break;
        default:
          console.error('Unrecognized message', parsedMessage);
      }
    };

    socket.onerror = (e) => {
      console.log('onerror::' + e.data);
    }

    socket.onclose = (e) => {
      console.log('onclose::' + e.data);
    }
  }

  getLocalStream = () => {

    var constraints = { audio: true, video: { width: 1280, height: 720 } };

    navigator.mediaDevices.getUserMedia(constraints)
      .then(function (mediaStream) {
        localStream = mediaStream;
        selfView.srcObject = mediaStream;
        selfView.mute = true;
        selfView.onloadedmetadata = function (e) {
          selfView.play();
        };
      })
      .catch((err) => {
        console.log(err.name + ": " + err.message);
      }
      );
  }


  // 获取6位随机id
  getRandomUserId() {
    var num = "";
    for (var i = 0; i < 6; i++) {
      num += Math.floor(Math.random() * 10);
    }
    return num;
  }

  join = (roomID) => {
    let message = {
      type: 'join',
      roomId: roomID,
      sessionId: this.getRandomUserId(),
    }
    socket.send(JSON.stringify(message));
  }

  onJoin = (socketIds) => {
    socketIds = JSON.parse(socketIds.data);
    console.log("socketIds:" + socketIds);
    for (var i in socketIds) {
      
      var socketId = socketIds[i];
      console.log("socketIds:socketId:" + socketId);
      this.createPC(socketId, true);
    }
  }

  createOffer = (pc, socketId) => {
    pc.createOffer((desc) => {
      console.log('createOffer', desc);
      pc.setLocalDescription(desc, () => {
        console.log('setLocalDescription', pc.localDescription);

        let message = {
          type: 'exchange',
          to: socketId,
          sdp: pc.localDescription,
        }
        socket.send(JSON.stringify(message));
      }, this.logError);
    }, this.logError);
  }

  createPC = (socketId, isOffer) => {
    var pc = new RTCPeerConnection(configuration);
    pcPeers[socketId] = pc;

    pc.onicecandidate = (event) => {
      console.log('onicecandidate', event);
      if (event.candidate) {

        let message = {
          type: 'exchange',
          to: socketId,
          candidate: event.candidate,
        }
        socket.send(JSON.stringify(message));
      }
    };

    pc.onnegotiationneeded = () => {
      console.log('onnegotiationneeded');
      if (isOffer) {
        this.createOffer(pc, socketId);
      }
    }

    pc.oniceconnectionstatechange = (event) => {
      console.log('oniceconnectionstatechange', event);
      if (event.target.iceConnectionState === 'connected') {
        this.createDataChannel(pc);
      }
    };
    pc.onsignalingstatechange = (event) => {
      console.log('onsignalingstatechange', event);
    };

    pc.onaddstream = (event) => {
      console.log('onaddstream', event);

      remoteView.srcObject = event.stream;
      remoteView.onloadedmetadata = function (e) {
        remoteView.play();
      };


    };
    pc.addStream(localStream);

    return pc;
  }

  createDataChannel = (pc) => {
    if (pc.textDataChannel) {
      return;
    }
    var dataChannel = pc.createDataChannel("text");

    dataChannel.onerror = (error) => {
      console.log("dataChannel.onerror", error);
    };

    dataChannel.onmessage = (event) => {
      console.log("dataChannel.onmessage:", event.data);
      var content = document.getElementById('textRoomContent');
      //content.innerHTML = content.innerHTML + '<p>' + socketId + ': ' + event.data + '</p>';
    };

    dataChannel.onopen = () => {
      console.log('dataChannel.onopen');
      // var textRoom = document.getElementById('textRoom');
      // textRoom.style.display = "block";
    };

    dataChannel.onclose = () => {
      console.log("dataChannel.onclose");
    };

    pc.textDataChannel = dataChannel;
  }

  exchange = (data) => {
    data = JSON.parse(data.data);
    var fromId = data.from;
    var pc;
    if (fromId in pcPeers) {
      pc = pcPeers[fromId];
    } else {
      pc = this.createPC(fromId, false);
    }

    console.log("data.from:" + data.from);

    if (data.sdp) {
      console.log('exchange sdp', data);
      pc.setRemoteDescription(new RTCSessionDescription(data.sdp), () => {
        if (pc.remoteDescription.type == "offer")
          pc.createAnswer((desc) => {
            console.log('createAnswer', desc);
            pc.setLocalDescription(desc, () => {
              console.log('setLocalDescription', pc.localDescription);

              let message = {
                type: 'exchange',
                to: fromId,
                sdp: pc.localDescription,
              }
              socket.send(JSON.stringify(message));
            }, this.logError);
          }, this.logError);
      }, this.logError);
    } else {
      console.log('exchange candidate', data);
      pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  }

  leave = (socketId) => {
    console.log('leave', socketId);
    var pc = pcPeers[socketId];
    pc.close();
    delete pcPeers[socketId];
    var video = document.getElementById("remoteView" + socketId);
    if (video) video.remove();
  }

  logError = (error) => {
    console.log("logError", error);
  }

  joinRoomPress = () => {
    var roomID = '111111';
    if (roomID == "") {
      alert('Please enter room ID');
    } else {
      this.join(roomID);
    }
  }

  textRoomPress() {
    var text = "test send text...";//document.getElementById('textRoomInput').value;
    if (text == "") {
      alert('Enter something');
    } else {
      //document.getElementById('textRoomInput').value = '';
      // var content = document.getElementById('textRoomContent');
      // content.innerHTML = content.innerHTML + '<p>' + 'Me' + ': ' + text + '</p>';
      for (var key in pcPeers) {
        var pc = pcPeers[key];
        pc.textDataChannel.send(text);
      }
    }
  }


  render() {
    const { classes } = this.props;
    return (
      <MuiThemeProvider theme={theme}>
        <div>
          <video ref='selfView' autoplay style={{ width: '320px', height: '240px' }}></video>
          <video ref='remoteView' autoplay style={{ width: '320px', height: '240px' }}></video>
          <Button color="primary" onClick={this.joinRoomPress}>
            join room
          </Button>
        </div>
      </MuiThemeProvider>
    );
  }

}

App.propTypes = {
  classes: PropTypes.object.isRequired,
};
