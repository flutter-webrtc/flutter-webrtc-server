import * as events from 'events';
import browser from 'bowser';

var RTCPeerConnection;
var RTCSessionDescription;
var configuration;

export default class Signaling extends events.EventEmitter {

    constructor(url, name) {
        super();
        this.socket = null;
        this.peer_connections = {};
        this.session_id = '0-0';
        this.self_id = 0;
        this.url = url;
        this.name = name;
        this.local_stream;
        this.keepalive_cnt = 0;

        RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection || window.msRTCPeerConnection;
        RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription || window.msRTCSessionDescription;
        navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia || navigator.msGetUserMedia;

        var twilioIceServers = [
            { url: 'stun:global.stun.twilio.com:3478?transport=udp' }
        ];

        configuration = { "iceServers": [{ "url": "stun:stun.l.google.com:19302" }] };

        this.socket = new WebSocket(this.url);
        this.socket.onopen = () => {
            console.log("wss connect success...");
            this.self_id = this.getRandomUserId();
            let message = {
                type: 'new',
                user_agent: browser.name + '/' + browser.version,
                name: this.name,
                id: this.self_id,
            }
            this.send(message);
            this.wsKeepaliveTimeoutId = setInterval(this.keepAlive, 12000);
        };

        this.socket.onmessage = (e) => {

            var parsedMessage = JSON.parse(e.data);

            console.info('on message: {\n    type = ' + parsedMessage.type + ', \n    data = ' + JSON.stringify(parsedMessage.data) + '\n}');

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
                case 'keepalive':
                    console.log('keepalive response!');
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

    keepAlive = () => {
        this.send({ type: 'keepalive', data: {} });
        console.log('Sent keepalive ' + ++this.keepalive_cnt + ' times!');
    }

    getLocalStream = (type) => {
        return new Promise((pResolve, pReject) => {
            var constraints = { audio: true, video: (type === 'video') ? { width: 1280, height: 720 } : false };
            var that = this;
            navigator.mediaDevices.getUserMedia(constraints)
                .then(function (mediaStream) {
                    pResolve(mediaStream);
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
        this.session_id = this.self_id + '-' + peer_id;
        let message = {
            type: 'invite',
            session_id: this.session_id,
            to: peer_id,
            media: type,
        }
        this.send(message);
    }

    bye = () => {
        let message = {
            type: 'bye',
            session_id: this.session_id,
            from: this.self_id,
        }
        this.send(message);
    }

    onRinging = (message) => {
        var data = message.data;
        var id = data.id;
        var media = data.media;
        console.log("Remote peer ready: id " + id);
        this.emit('ringing', id);
        this.getLocalStream(media).then((stream) => {
            this.local_stream = stream;
            this.createPeerConnection(id, true, stream);
            this.emit('localstream', stream);
        });
    }

    onInvite = (message) => {
        var data = message.data;
        var from = data.from;
        console.log("data:" + data);
        var media = data.media;
        this.session_id = data.session_id;
        this.emit('invite', from, this.session_id);
        this.getLocalStream(media).then((stream) => {
            this.local_stream = stream;
            this.emit('localstream', stream);
            var pc = this.createPeerConnection(from, false, stream);
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
                    session_id: this.session_id,
                }
                this.send(message);
            }, this.logError);
        }, this.logError);
    }

    createPeerConnection = (id, isOffer, localstream) => {
        var pc = new RTCPeerConnection(configuration);
        this.peer_connections["" + id] = pc;
        pc.onicecandidate = (event) => {
            console.log('onicecandidate', event);
            if (event.candidate) {
                let message = {
                    type: 'candidate',
                    to: id,
                    candidate: event.candidate,
                    session_id: this.session_id,
                }
                this.send(message);
            }
        };

        pc.onnegotiationneeded = () => {
            console.log('onnegotiationneeded');
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
            this.emit('addstream', event.stream);
        };

        pc.onremovestream = (event) => {
            console.log('onremovestream', event);
            this.emit('removestream', event.stream);
        };

        pc.addStream(localstream);

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
        };

        dataChannel.onclose = () => {
            console.log("dataChannel.onclose");
        };

        pc.textDataChannel = dataChannel;
    }

    onPeers = (message) => {
        var data = message.data;
        console.log("peers = " + JSON.stringify(data));
        this.emit('peers', data, this.self_id);
    }

    onOffer = (message) => {
        var data = message.data;
        var from = data.from;

        console.log("data.from:" + data.from);

        var pc = null;
        if (from in this.peer_connections) {
            pc = this.peer_connections[from];
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
                                session_id: this.session_id,
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
        if (from in this.peer_connections) {
            pc = this.peer_connections[from];
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
        if (from in this.peer_connections) {
            pc = this.peer_connections[from];
        }
        if (pc && data.candidate) {
            pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    }

    onLeave = (message) => {
        var id = message.data;
        console.log('leave', id);
        var peerConnections = this.peer_connections;
        var pc = peerConnections[id];
        if (pc !== undefined) {
            pc.close();
            delete peerConnections[id];
            this.emit('leave', id);
        }
        if (this.local_stream != null) {
            this.closeMediaStream(this.local_stream);
            this.local_stream = null;
        }
    }

    onBye = (message) => {
        var data = message.data;
        var from = data.from;
        var to = data.to;
        console.log('bye: ', data.session_id);
        var peerConnections = this.peer_connections;
        var pc = peerConnections[to] || peerConnections[from];
        if (pc !== undefined) {
            pc.close();
            delete peerConnections[to];
            this.emit('bye', to, this.session_id);
        }
        if (this.local_stream != null) {
            this.closeMediaStream(this.local_stream);
            this.local_stream = null;
        }
        this.session_id = '0-0';
    }

    logError = (error) => {
        console.log("logError", error);
    }

    invitePeer = (peer_id, type) => {
        this.invite(peer_id, type);
        this.getLocalStream(type);
    }

    sendText() {
        var text = "test send text...";//document.getElementById('textRoomInput').value;
        if (text == "") {
            alert('Enter something');
        } else {
            //document.getElementById('textRoomInput').value = '';
            // var content = document.getElementById('textRoomContent');
            // content.innerHTML = content.innerHTML + '<p>' + 'Me' + ': ' + text + '</p>';
            for (var key in this.peer_connections) {
                var pc = this.peer_connections[key];
                pc.textDataChannel.send(text);
            }
        }
    }

    closeMediaStream = (stream) => {
        if (!stream)
            return;

        let tracks = stream.getTracks();

        for (let i = 0, len = tracks.length; i < len; i++) {
            tracks[i].stop();
        }
    }
}