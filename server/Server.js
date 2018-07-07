import express from 'express';
var app = express();
import fs from 'fs';
import ws from 'ws';
import https from 'https';

export default class CallHandler {

    constructor() {
        this.wss = null;
        this.server = null;
        this.sessions = [];
    }

    init() {
        var options = {
            key: fs.readFileSync('certs/key.pem'),
            cert: fs.readFileSync('certs/cert.pem')
        };

        var server_port = (process.env.PORT || 4443);
        this.server = https.createServer(options, app).listen(server_port, () => {
            console.log("flutter webrtc server started");
        });

        this.wss = new ws.Server({ server: this.server });
        this.wss.on('connection', this.onConnection);
    }

    updatePeers = () => {
        var peers = [];

        this.wss.clients.forEach(function (client) {
            var peer = {};
            if (client.hasOwnProperty('id')) {
                peer.id = client.id;
            }
            if (client.hasOwnProperty('name')) {
                peer.name = client.name;
            }
            if (client.hasOwnProperty('user_agent')) {
                peer.user_agent = client.user_agent;
            }
            if (client.hasOwnProperty('session_id')) {
                peer.session_id = client.session_id;
            }
            peers.push(peer);
        });

        var msg = {
            type: "peers",
            data: peers,
        };

        this.wss.clients.forEach(function (client) {
            client.send(JSON.stringify(msg));
        });
    }

    onConnection = (client_self) => {
        console.log('connection');

        client_self.on("close", data => {
            var session_id = client_self.session_id;

            //remove old session_id
            if (session_id !== undefined) {
                for (let i = 0; i < this.sessions.length; i++) {
                    let item = this.sessions[i];
                    if (item.id == session_id) {
                        this.sessions.splice(i, 1);
                        break;
                    }
                }
            }
            var msg = {
                type: "leave",
                data: client_self.id,
            };

            this.wss.clients.forEach(function (client) {
                if (client != client_self)
                    client.send(JSON.stringify(msg));
            });

            this.updatePeers();
        });

        client_self.on("message", message => {
            try {
                message = JSON.parse(message);
                console.log("message.type:: " + message.type + ", \nbody: " + JSON.stringify(message));
            } catch (e) {
                console.log(e.message);
            }

            switch (message.type) {
                case 'new':
                    {
                        client_self.id = "" + message.id;
                        client_self.name = message.name;
                        client_self.user_agent = message.user_agent;
                        this.updatePeers();
                    }
                    break;
                case 'bye':
                    {
                        var session = null;
                        this.sessions.forEach((sess) => {
                            if (sess.id == message.session_id) {
                                session = sess;
                            }
                        });

                        if (!session) {
                            var msg = {
                                type: "error",
                                data: {
                                    error: "Invalid session " + message.session_id,
                                },
                            };
                            client.send(JSON.stringify(msg));
                            return;
                        }

                        this.wss.clients.forEach((client) => {
                            if (client.session_id === message.session_id) {
                                try {

                                    var msg = {
                                        type: "bye",
                                        data: {
                                            session_id: message.session_id,
                                            from: message.from,
                                            to: (client.id == session.from ? session.to : session.from),
                                        },
                                    };
                                    client.send(JSON.stringify(msg));
                                } catch (e) {
                                    console.log("onUserJoin:" + e.message);
                                }
                            }
                        });
                    }
                    break;
                case "invite":
                    {
                        var peer = null;
                        this.wss.clients.forEach(function (client) {
                            if (client.hasOwnProperty('id') && client.id === "" + message.to) {
                                peer = client;
                            }
                        });

                        if (peer != null) {
                            var msg = {
                                type: "ringing",
                                data: {
                                    id: peer.id,
                                    media: message.media,
                                }
                            };
                            client_self.send(JSON.stringify(msg));
                            client_self.session_id = message.session_id;

                            msg = {
                                type: "invite",
                                data: {
                                    to: peer.id,
                                    from: client_self.id,
                                    media: message.media,
                                    session_id: message.session_id,
                                }
                            }
                            peer.send(JSON.stringify(msg));
                            peer.session_id = message.session_id;

                            let session = {
                                id: message.session_id,
                                from: client_self.id,
                                to: peer.id,
                            };
                            this.sessions.push(session);
                        }

                        break;
                    }
                case 'offer':
                    {
                        var msg = {
                            type: "offer",
                            data: {
                                from: client_self.id,
                                to: message.to,
                                sdp: message.sdp,
                            },
                        };

                        this.wss.clients.forEach(function (client) {
                            if (client.id === "" + message.to && client.session_id === message.session_id) {
                                try {
                                    client.send(JSON.stringify(msg));
                                } catch (e) {
                                    console.log("onUserJoin:" + e.message);
                                }
                            }
                        });
                    }
                    break;
                case 'answer':
                    {
                        var msg = {
                            type: "answer",
                            data: {
                                from: client_self.id,
                                to: message.to,
                                sdp: message.sdp,
                            }
                        };

                        this.wss.clients.forEach(function (client) {
                            if (client.id === "" + message.to && client.session_id === message.session_id) {
                                try {
                                    client.send(JSON.stringify(msg));
                                } catch (e) {
                                    console.log("onUserJoin:" + e.message);
                                }
                            }
                        });
                    }
                    break;
                case 'candidate':
                    {
                        var msg = {
                            type: "candidate",
                            data: {
                                from: client_self.id,
                                to: message.to,
                                candidate: message.candidate,
                            }
                        };
                        
                        this.wss.clients.forEach(function (client) {
                            if (client.id === "" + message.to && client.session_id === message.session_id) {
                                try {
                                    client.send(JSON.stringify(msg));
                                } catch (e) {
                                    console.log("onUserJoin:" + e.message);
                                }
                            }
                        });
                    }
                    break;
                default:
                    console.log("Unhandled message: " + message.type);
            }
        });
    }
}

let callHandler = new CallHandler();
callHandler.init();
