import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { MuiThemeProvider, createMuiTheme } from '@material-ui/core/styles';
import { withStyles } from '@material-ui/core/styles';
import AppBar from '@material-ui/core/AppBar';
import Toolbar from '@material-ui/core/Toolbar';
import Button from '@material-ui/core/Button';
import IconButton from '@material-ui/core/IconButton';
import MenuIcon from '@material-ui/icons/Menu';
import blue from '@material-ui/core/colors/blue';
import ListItemText from '@material-ui/core/ListItemText';
import ListItem from '@material-ui/core/ListItem';
import List from '@material-ui/core/List';
import Divider from '@material-ui/core/Divider';
import browser from 'bowser';
import Dialog from '@material-ui/core/Dialog';
import Typography from '@material-ui/core/Typography';
import CloseIcon from '@material-ui/icons/Close';
import Slide from '@material-ui/core/Slide';
import VideoCamIcon from '@material-ui/icons/Videocam';
import CallIcon from '@material-ui/icons/Call';
import PhoneIcon from '@material-ui/icons/CallEnd';
import VideoOnIcon from '@material-ui/icons/Videocam';
import VideoOffIcon from '@material-ui/icons/VideocamOff';
import MicIcon from '@material-ui/icons/Mic';
import MicOffIcon from '@material-ui/icons/MicOff';
import LocalVideoView from './LocalVideoView';
import RemoteVideoView from './RemoteVideoView';
import css from './layout.css';


var RTCPeerConnection;
var RTCSessionDescription;
var configuration;

const theme = createMuiTheme({
  palette: {
    primary: blue,
  },
});

const styles = {
  root: {
    flexGrow: 1,
  },
  flex: {
    flex: 1,
  },
  menuButton: {
    marginLeft: -12,
    marginRight: 20,
  },

  btnTool: {
    color: 'white',
    marginRight: 20,
  },
};

function Transition(props) {
  return <Slide direction="up" {...props} />;
}

class App extends Component {

  constructor(props) {
    super(props);

    this.socket;
    this.selfView = null;
    this.remoteView = null;

    this.state = {
      peerConnections: {},
      session_id: '0-0',
      joined: false,
      peers: [],
      open: false,
      self_id: 0,
      localStream: null,
      remoteStream: null,
      audio_muted: false,
      video_muted: false,
      // local_video_muted: false,
      // local_audio_muted: false,
    };
  }

  componentDidMount = () => {

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
      var self_id = this.getRandomUserId();
      let message = {
        type: 'new',
        user_agent: browser.name + '/' + browser.version,
        name: 'WebAPP',
        id: self_id,
      }
      this.setState({ self_id });
      this.send(message);
    };

    this.socket.onmessage = (e) => {

      var parsedMessage = JSON.parse(e.data);

      console.info('on message: {\n    type = ' + parsedMessage.type + ', \n    data = ' + parsedMessage.data + '\n}');

      switch (parsedMessage.type) {
        case 'invite':
          this.onInvite(parsedMessage);
          break;
        case 'ringing':
          this.onRinging(parsedMessage);
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
          this.onLeave(parsedMessage);
          break;
        case 'bye':
          this.onBye(parsedMessage);
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

  getLocalStream = (type) => {
    return new Promise((pResolve, pReject) => {
      var constraints = { audio: true, video: (type === 'video') ? { width: 1280, height: 720 } : false };
      var that = this;
      navigator.mediaDevices.getUserMedia(constraints)
        .then(function (mediaStream) {
          that.setState({ localStream: mediaStream });
          pResolve();
        }).catch((err) => {
          console.log(err.name + ": " + err.message);
          pReject(err);
        }
        );
    });
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

  invite = (peer_id, type) => {
    var session_id = this.state.self_id + '-' + peer_id;
    let message = {
      type: 'invite',
      session_id: session_id,
      to: peer_id,
      media: type,
    }
    this.setState({ session_id });
    this.send(message);
  }

  leave = () => {
    let message = {
      type: 'bye',
      session_id: this.state.session_id,
      from: this.state.self_id,
    }
    this.send(message);
  }

  onRinging = (message) => {
    var data = message.data;
    var id = data.id;
    var media = data.media;
    console.log("Remote peer ready: id " + id);
    this.getLocalStream(media).then(() => {
      this.createPC(id, true);
      this.setState({ joined: true, open: true });
    });
  }

  onInvite = (message) => {
    var data = message.data;
    var from = data.from;
    console.log("data:" + data);
    var media = data.media;
    this.setState({ open: true, session_id: data.session_id });
    this.getLocalStream(media).then(() => {
      var pc = this.createPC(from, false);
    });
  }

  createOffer = (pc, id) => {
    pc.createOffer((desc) => {
      console.log('createOffer: ', desc.sdp);
      pc.setLocalDescription(desc, () => {
        console.log('setLocalDescription', pc.localDescription);
        let message = {
          type: 'offer',
          to: id,
          description: pc.localDescription,
          session_id: this.state.session_id,
        }
        this.send(message);
      }, this.logError);
    }, this.logError);
  }

  createPC = (id, isOffer) => {
    var pc = new RTCPeerConnection(configuration);
    this.state.peerConnections["" + id] = pc;
    pc.onicecandidate = (event) => {
      console.log('onicecandidate', event);
      if (event.candidate) {
        let message = {
          type: 'candidate',
          to: id,
          candidate: event.candidate,
          session_id: this.state.session_id,
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
      this.setState({ remoteStream: event.stream });
    };

    pc.addStream(this.state.localStream);

    if (isOffer)
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

  onPeers = (message) => {
    var data = message.data;
    console.log("peers = " + JSON.stringify(data));
    this.setState({ peers: data });
  }

  onOffer = (message) => {
    var data = message.data;
    var from = data.from;

    console.log("data.from:" + data.from);

    var pc = null;
    if (from in this.state.peerConnections) {
      pc = this.state.peerConnections[from];
    }
    if (pc && data.description) {
      //console.log('on offer sdp', data);
      pc.setRemoteDescription(new RTCSessionDescription(data.description), () => {
        if (pc.remoteDescription.type == "offer")
          pc.createAnswer((desc) => {
            console.log('createAnswer: ', desc.description);
            pc.setLocalDescription(desc, () => {
              console.log('setLocalDescription', pc.localDescription);
              let message = {
                type: 'answer',
                to: from,
                description: pc.localDescription,
                session_id: this.state.session_id,
              }
              this.send(message);
            }, this.logError);
          }, this.logError);
      }, this.logError);
    }

  }

  onAnswer = (message) => {
    var data = message.data;
    var from = data.from;
    var pc = null;
    if (from in this.state.peerConnections) {
      pc = this.state.peerConnections[from];
    }

    if (pc && data.description) {
      //console.log('on answer sdp', data);
      pc.setRemoteDescription(new RTCSessionDescription(data.description), () => {
      }, this.logError);
    }
  }

  onCandidate = (message) => {
    var data = message.data;
    var from = data.from;
    var pc = null;
    if (from in this.state.peerConnections) {
      pc = this.state.peerConnections[from];
    }
    if (pc && data.candidate) {
      //console.log('on candidate ', data);
      pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  }

  onLeave = (message) => {
    var id = message.data;
    console.log('leave', id);
    var peerConnections = this.state.peerConnections;
    var pc = peerConnections[id];
    if (pc !== undefined) {
      pc.close();
      delete peerConnections[id];
      this.setState({
        joined: false,
        peerConnections,
        open: false,
        localStream: null,
        remoteStream: null
      });
    }
  }

  onBye = (message) => {
    var data = message.data;
    var from = data.from;
    var to = data.to;
    console.log('bye: ', data.session_id);
    var peerConnections = this.state.peerConnections;
    var pc = peerConnections[to];
    if (pc !== undefined) {
      pc.close();
      delete peerConnections[to];
      this.setState({
        joined: false,
        peerConnections,
        open: false,
        localStream: null,
        remoteStream: null
      });
    }
  }

  logError = (error) => {
    console.log("logError", error);
  }

  invitePeer = (peer_id, type) => {
    this.setState({ joined: true, open: true });
    this.invite(peer_id, type);
    this.getLocalStream(type);
  }

  textRoomPress() {
    var text = "test send text...";//document.getElementById('textRoomInput').value;
    if (text == "") {
      alert('Enter something');
    } else {
      //document.getElementById('textRoomInput').value = '';
      // var content = document.getElementById('textRoomContent');
      // content.innerHTML = content.innerHTML + '<p>' + 'Me' + ': ' + text + '</p>';
      for (var key in this.state.peerConnections) {
        var pc = this.state.peerConnections[key];
        pc.textDataChannel.send(text);
      }
    }
  }

  handleClickOpen = () => {
    this.setState({ open: true });
  };

  handleClose = () => {
    this.setState({ open: false });
  };

  /**
     * video open/close
     */
  onVideoOnClickHandler = () => {
    let video_muted = !this.state.video_muted;
    this.onToggleLocalVideoTrack(video_muted);
    this.setState({ video_muted });
  }

  onToggleLocalVideoTrack = (muted) => {
    var videoTracks = this.state.localStream.getVideoTracks();
    if (videoTracks.length === 0) {
      console.log("No local video available.");
      return;
    }
    console.log("Toggling video mute state.");
    for (var i = 0; i < videoTracks.length; ++i) {
      videoTracks[i].enabled = !muted;
    }
  }

  /**
     * mic open/close
     */
  onAudioClickHandler = () => {
    let audio_muted = !this.state.audio_muted;
    this.onToggleLocalAudioTrack(audio_muted);
    this.setState({ audio_muted });
  }


  onToggleLocalAudioTrack = (muted) => {
    var audioTracks = this.state.localStream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.log("No local audio available.");
      return;
    }
    console.log("Toggling audio mute state.");
    for (var i = 0; i < audioTracks.length; ++i) {
      audioTracks[i].enabled = !muted;
    }

  }


  render() {
    const { classes } = this.props;
    return (
      <MuiThemeProvider theme={theme}>
        <div className={classes.root}>
          <AppBar position="static">
            <Toolbar>
              <IconButton className={classes.menuButton} color="inherit" aria-label="Menu">
                <MenuIcon />
              </IconButton>
              <Typography variant="title" color="inherit" className={classes.flex}>
                Flutter WebRTC Demo
            </Typography>
              {/*<Button color="inherit">Join</Button>*/}
            </Toolbar>
          </AppBar>
          <List>
            {
              this.state.peers.map((peer, i) => {
                if (peer.id == this.state.self_id)
                  return null;
                return (
                  <div>
                    <ListItem button>
                      <ListItemText primary={peer.name + '  [' + peer.user_agent + ']'} secondary={'id: ' + peer.id} />
                      <IconButton color="primary" onClick={() => this.invitePeer(peer.id, 'audio')} className={classes.button} aria-label="Make a voice call.">
                        <CallIcon />
                      </IconButton>
                      <IconButton color="primary" onClick={() => this.invitePeer(peer.id, 'video')} className={classes.button} aria-label="Make a video call.">
                        <VideoCamIcon />
                      </IconButton>
                    </ListItem>
                    <Divider />
                  </div>
                )
              })
            }
          </List>
          <Dialog
            fullScreen
            open={this.state.open}
            onClose={this.handleClose}
            TransitionComponent={Transition}
          >
            <AppBar className={classes.appBar}>
              <Toolbar>
                <Typography variant="title" color="inherit" className={classes.flex}>
                  Calling
              </Typography>
              </Toolbar>
            </AppBar>
            <div>
              {
                this.state.remoteStream != null ? <RemoteVideoView stream={this.state.remoteStream} id={'remoteview'} /> : null
              }
              {
                this.state.localStream != null ? <LocalVideoView stream={this.state.localStream} muted={this.state.video_muted} id={'localview'} /> : null
              }
            </div>


            <div className={css.btnTools}>
              <Button variant="fab" mini color="primary" aria-label="add" style={styles.btnTool} onClick={this.onVideoOnClickHandler}>
                {
                  this.state.video_muted ? <VideoOffIcon /> : <VideoOnIcon />
                }
              </Button>
              <Button variant="fab" color="secondary" aria-label="add" style={styles.btnTool} onClick={this.leave}>
                <PhoneIcon />
              </Button>
              <Button variant="fab" mini color="primary" aria-label="add" style={styles.btnTool} onClick={this.onAudioClickHandler}>
                {
                  this.state.audio_muted ? <MicOffIcon /> : <MicIcon />
                }
              </Button>
            </div>

          </Dialog>

        </div>
      </MuiThemeProvider>
    );
  }

}

App.propTypes = {
  classes: PropTypes.object.isRequired,
};

export default withStyles(styles)(App);
