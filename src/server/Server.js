import express from 'express';
var app = express();
import fs from 'fs';
import ws from 'ws';
import https from 'https';

export default class CallHandler {

    constructor() {
        this.wss = null;
        this.server = null;
        this.rooms = new Array();
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
            peers.push(peer);
        });

        var msg = new Object();
        msg.type = "peers";
        msg.data = JSON.stringify(peers);

        this.wss.clients.forEach(function (client) {
            client.send(JSON.stringify(msg));
        });
    }

    onConnection = (new_client) => {
        console.log('connection');

        new_client.on("close", data => {
            var msg = new Object();
            msg.type = "leave";
            msg.data = JSON.stringify(new_client.id);

            //remove old room
            /*
            if (client.room !== undefined) {
                for (let i = 0; i < this.rooms.length; i++) {
                    let item = this.rooms[i];
                    if (item == client.room) {
                      this.rooms.splice(i, 1);
                      break;
                    }
                }
            }*/

            this.wss.clients.forEach(function (client) {
                if(client != new_client)
                    client.send(JSON.stringify(msg));
            });

            this.updatePeers();
        });

        new_client.on("message", message => {

            try {
                message = JSON.parse(message);
                console.log("message.type:: " + message.type + ", \nbody: " + JSON.stringify(message));
            } catch (e) {
                console.log(e.message);
            }

            switch (message.type) {
                case 'new':
                    {
                        new_client.id = message.id;
                        new_client.name = message.name;
                        new_client.user_agent = message.user_agent;
                        this.updatePeers();
                    }
                    break;
                case "join":
                    {
                        var ids = [];
                        this.wss.clients.forEach(function (client) {
                            if (client.hasOwnProperty('id') && client.room === message.room) {
                                ids.push(client.id);
                            }
                        });
                        var msg = new Object();
                        msg.type = "join";
                        msg.data = JSON.stringify(ids);
                        new_client.send(JSON.stringify(msg));
                        new_client.room = message.room;
                        this.rooms.push(message.room);
                        break;
                    }
                case 'offer':
                    {
                        var data = {
                            from: new_client.id,
                            to: message.to,
                            sdp: message.sdp,
                        };

                        var msg = new Object();
                        msg.type = "offer";
                        msg.data = JSON.stringify(data);

                        this.wss.clients.forEach(function (client) {
                            if (client.id === message.to && client.room === message.room) {
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
                            from: new_client.id,
                            to: message.to,
                            sdp: message.sdp,
                        };

                        var msg = new Object();
                        msg.type = "answer";
                        msg.data = JSON.stringify(data);

                        this.wss.clients.forEach(function (client) {
                            if (client.id === message.to && client.room === message.room) {
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
                            from: new_client.id,
                            to: message.to,
                            candidate: message.candidate,
                        };

                        var msg = new Object();
                        msg.type = "candidate";
                        msg.data = JSON.stringify(data);

                        this.wss.clients.forEach(function (client) {
                            if (client.id === message.to && client.room === message.room) {
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
