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
            key: fs.readFileSync('../../certs/key.pem'),
            cert: fs.readFileSync('../../certs/cert.pem')
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
            var peer = new Object();
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

        var msg = new Object();
        msg.type = "peers";
        msg.data = peers;

        this.wss.clients.forEach(function (client) {
            client.send(JSON.stringify(msg));
        });
    }

    onConnection = (client_self) => {
        console.log('connection');

        client_self.on("close", data => {
            var msg = new Object();
            msg.type = "leave";
            msg.data = client_self.id;

            //remove old session_id
            /*
            if (client.session_id !== undefined) {
                for (let i = 0; i < sessions.length; i++) {
                    let item = sessions[i];
                    if (item == client.session_id) {
                      sessions.splice(i, 1);
                      break;
                    }
                }
            }*/

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
                        var clients = [];
                        var idx = 0;
                        this.wss.clients.forEach(function (client) {
                            if (client.session_id === message.session_id) {
                                try {
                                    clients[idx] = client;
                                    idx++;
                                } catch (e) {
                                    console.log("onUserJoin:" + e.message);
                                }
                            }
                        });
                        var data = {
                            session_id: message.session_id,
                        };

                        var msg = new Object();
                        msg.type = "bye";

                        data.to = clients[1].id;
                        msg.data = data;
                        clients[0].send(JSON.stringify(msg));

                        data.to = clients[0].id;
                        msg.data = data;
                        clients[1].send(JSON.stringify(msg));
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
                            var msg = new Object();
                            msg.type = "ringing";
                            var data3 = new Object();
                            data3.id = peer.id;
                            data3.media = message.media;
                            msg.data = data3;
                            client_self.send(JSON.stringify(msg));
                            client_self.session_id = message.session_id;

                            msg.type = "invite";
                            var data = new Object();
                            data.to = peer.id;
                            data.type = message.type;
                            data.from = client_self.id;
                            data.media = message.media;
                            data.session_id = message.session_id;
                            msg.data = data;
                            peer.send(JSON.stringify(msg));
                            peer.session_id = message.session_id;
                        }

                        this.sessions.push(message.session_id);
                        break;
                    }
                case 'offer':
                    {
                        var data = {
                            from: client_self.id,
                            to: message.to,
                            sdp: message.sdp,
                        };

                        var msg = new Object();
                        msg.type = "offer";
                        msg.data = data;

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
                        var data = {
                            from: client_self.id,
                            to: message.to,
                            sdp: message.sdp,
                        };

                        var msg = new Object();
                        msg.type = "answer";
                        msg.data = data;

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
                        var data = {
                            from: client_self.id,
                            to: message.to,
                            candidate: message.candidate,
                        };

                        var msg = new Object();
                        msg.type = "candidate";
                        msg.data = data;

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
