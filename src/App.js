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

var socket = require('socket.io-client')('https://localhost:4443');

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


    socket.on('exchange', (data) => {
      this.exchange(data);
    });
    socket.on('leave', (socketId) => {
      this.leave(socketId);
    });

    socket.on('connect', (data) => {
      console.log('connect');
      this.getLocalStream();
    });

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

  join = (roomID) => {
    socket.emit('join', roomID, (socketIds) => {
      console.log('join', socketIds);
      for (var i in socketIds) {
        var socketId = socketIds[i];
        this.createPC(socketId, true);
      }
    });
  }

  createOffer = (pc, socketId) => {
    pc.createOffer((desc) => {
      console.log('createOffer', desc);
      pc.setLocalDescription(desc, () => {
        console.log('setLocalDescription', pc.localDescription);
        socket.emit('exchange', { 'to': socketId, 'sdp': pc.localDescription });
      }, this.logError);
    }, this.logError);
  }

  createPC = (socketId, isOffer) => {
    var pc = new RTCPeerConnection(configuration);
    pcPeers[socketId] = pc;

    pc.onicecandidate = (event) => {
      console.log('onicecandidate', event);
      if (event.candidate) {
        socket.emit('exchange', { 'to': socketId, 'candidate': event.candidate });
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
      // var element = document.createElement('video');
      // element.id = "remoteView" + socketId;
      // element.autoplay = 'autoplay';
      // element.src = URL.createObjectURL(event.stream);
      // remoteViewContainer.appendChild(element);

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
    var fromId = data.from;
    var pc;
    if (fromId in pcPeers) {
      pc = pcPeers[fromId];
    } else {
      pc = this.createPC(fromId, false);
    }

    if (data.sdp) {
      console.log('exchange sdp', data);
      pc.setRemoteDescription(new RTCSessionDescription(data.sdp), () => {
        if (pc.remoteDescription.type == "offer")
          pc.createAnswer((desc) => {
            console.log('createAnswer', desc);
            pc.setLocalDescription(desc, () => {
              console.log('setLocalDescription', pc.localDescription);
              socket.emit('exchange', { 'to': fromId, 'sdp': pc.localDescription });
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
