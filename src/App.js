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


var RTCPeerConnection;
var RTCSessionDescription;
var configuration;

const theme = createMuiTheme({
  palette: {
    primary: blue,
  },
});

export default class App extends Component {

  constructor(props) {
    super(props);

    this.socket;
    this.selfView = null;
    this.remoteView = null;
    this.localStream = null;
    this.state = {
      pcPeers: {},
      room: '111111',
    };
  }

  componentDidMount = () => {

    this.remoteView = this.refs['remoteView'];
    this.selfView = this.refs['selfView'];

    RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection || window.msRTCPeerConnection;
    RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription || window.msRTCSessionDescription;
    navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia || navigator.msGetUserMedia;

    var twilioIceServers = [
      { url: 'stun:global.stun.twilio.com:3478?transport=udp' }
    ];
    configuration = { "iceServers": [{ "url": "stun:stun.l.google.com:19302" }] };

    this.socket = new WebSocket('wss://localhost:4443');
    this.socket.onopen = () => {
      console.log("wss connect success...");

      let message = {
        type: 'new',
        user_agent: 'html5/Chrome m68',
        name: 'WebAPP',
        id: this.getRandomUserId(),
      }
      this.send(message);
      this.getLocalStream();
    };

    this.socket.onmessage = (e) => {

      var parsedMessage = JSON.parse(e.data);

      console.info('on message: {\n    type = ' + parsedMessage.type + ', \n    data = ' + parsedMessage.data + '\n}');

      switch (parsedMessage.type) {
        case 'join':
          this.onJoin(parsedMessage);
          break;
        case 'offer':
          this.onOffer(parsedMessage);
          break;
        case 'answer':
          this.onAnswer(parsedMessage);
          break;
        case 'candidate':
          this.onCandidate(parsedMessage);
          break;
        case 'peers':
          this.onPeers(parsedMessage);
          break;
        case 'leave':
          var id = JSON.parse(parsedMessage.data);
          this.leave(id);
          break;
        default:
          console.error('Unrecognized message', parsedMessage);
      }
    };

    this.socket.onerror = (e) => {
      console.log('onerror::' + e.data);
    }

    this.socket.onclose = (e) => {
      console.log('onclose::' + e.data);
    }
  }

  getLocalStream = () => {
    var constraints = { audio: true, video: { width: 1280, height: 720 } };
    var thiz = this;
    var selfView = this.selfView;
    navigator.mediaDevices.getUserMedia(constraints)
      .then(function (mediaStream) {
        thiz.localStream = mediaStream;
        selfView.srcObject = mediaStream;
        selfView.mute = true;
        selfView.onloadedmetadata = function (e) {
          selfView.play();
        };
      }).catch((err) => {
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

  send = (data) => {
    this.socket.send(JSON.stringify(data));
  }

  join = (room) => {
    let message = {
      type: 'join',
      room: this.state.room,
    }
    this.send(message);
  }

  onJoin = (ids) => {
    ids = JSON.parse(ids.data);
    console.log("ids:" + ids);
    for (var i in ids) {
      var id = ids[i];
      console.log("ids => id " + id);
      this.createPC(id, true);
    }
  }

  createOffer = (pc, id) => {
    pc.createOffer((desc) => {
      console.log('createOffer: ', desc.sdp);
      pc.setLocalDescription(desc, () => {
        console.log('setLocalDescription', pc.localDescription);
        let message = {
          type: 'offer',
          to: id,
          sdp: pc.localDescription,
          room: this.state.room,
        }
        this.send(message);
      }, this.logError);
    }, this.logError);
  }

  createPC = (id, isOffer) => {
    var pc = new RTCPeerConnection(configuration);
    this.state.pcPeers[id] = pc;
    pc.onicecandidate = (event) => {
      console.log('onicecandidate', event);
      if (event.candidate) {
        let message = {
          type: 'candidate',
          to: id,
          candidate: event.candidate,
          room: this.state.room,
        }
        this.send(message);
      }
    };

    pc.onnegotiationneeded = () => {
      console.log('onnegotiationneeded');
      //if (isOffer) {
      //  this.createOffer(pc, id);
      //}
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
      var remoteView = this.remoteView;
      remoteView.srcObject = event.stream;
      remoteView.onloadedmetadata = function (e) {
        remoteView.play();
      };
    };

    pc.addStream(this.localStream);

    if(isOffer)
      this.createOffer(pc, id);
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

  onPeers = (data) => {
    console.log("peers = " + JSON.stringify(data));
  }

  onOffer = (data) => {
    data = JSON.parse(data.data);
    var from = data.from;
    var pc = this.createPC(from, false);

    console.log("data.from:" + data.from);

    if (data.sdp) {
      //console.log('on offer sdp', data);
      pc.setRemoteDescription(new RTCSessionDescription(data.sdp), () => {
        if (pc.remoteDescription.type == "offer")
          pc.createAnswer((desc) => {
            console.log('createAnswer: ', desc.sdp);
            pc.setLocalDescription(desc, () => {
              console.log('setLocalDescription', pc.localDescription);
              let message = {
                type: 'answer',
                to: from,
                sdp: pc.localDescription,
                room: this.state.room,
              }
              this.send(message);
            }, this.logError);
          }, this.logError);
      }, this.logError);
    }
  }

  onAnswer = (data) => {
    data = JSON.parse(data.data);
    var from = data.from;
    var pc = null;
    if (from in this.state.pcPeers) {
      pc = this.state.pcPeers[from];
    }

    if (pc && data.sdp) {
      //console.log('on answer sdp', data);
      pc.setRemoteDescription(new RTCSessionDescription(data.sdp), () => {
      }, this.logError);
    }
  }

  onCandidate = (data) => {
    data = JSON.parse(data.data);
    var from = data.from;
    var pc = null;
    if (from in this.state.pcPeers) {
      pc = this.state.pcPeers[from];
    }
    if (pc && data.candidate) {
      //console.log('on candidate ', data);
      pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  }

  leave = (socketId) => {
    console.log('leave', socketId);
    var pc = this.state.pcPeers[socketId];
    if (pc !== undefined) pc.close();
    delete this.state.pcPeers[socketId];
    var video = document.getElementById("remoteView" + socketId);
    if (video) video.remove();
  }

  logError = (error) => {
    console.log("logError", error);
  }

  joinRoomPress = () => {
    if (this.state.room == "") {
      alert('Please enter room ID');
    } else {
      this.join(this.state.room);
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
      for (var key in this.state.pcPeers) {
        var pc = this.state.pcPeers[key];
        pc.textDataChannel.send(text);
      }
    }
  }


  render() {
    const { classes } = this.props;
    return (
      <MuiThemeProvider theme={theme}>
        <div>
          <video ref='selfView' autoplay muted='true' style={{ width: '320px', height: '240px' }}></video>
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
