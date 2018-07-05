import express from 'express';
var app = express();
import fs from 'fs';
import ws from 'ws';
import https from 'https';
var options = {
  key: fs.readFileSync('../../certs/key.pem'),
  cert: fs.readFileSync('../../certs/cert.pem')
};
var serverPort = (process.env.PORT || 4443);


let server = https.createServer(options, app).listen(serverPort, () => {
  console.log("flutter webrtc server started");
});

let wss = new ws.Server({ server: server });

export default class CallHandler {

  init() {

    wss.on('connection', (client) => {
      console.log('connection');

      client.on("close", data => {

        var msg = new Object();
        msg.type = "leave";
        msg.data = JSON.stringify(client.sessionId);

        wss.clients.forEach(function (cur_client) {
          cur_client.send(JSON.stringify(msg));
        }
        );

      });

      client.on("message", message => {

        try {
          message = JSON.parse(message);
          console.log("message.type::" + message.type);
        } catch (e) {
          console.log(e.message);
        }

        switch (message.type) {
          case "join":

            var sessionIds = [];
            wss.clients.forEach(function (cur_client) {
              if (cur_client.hasOwnProperty('sessionId') && cur_client.roomId === message.roomId) {
                sessionIds.push(cur_client.sessionId);
              }
            });
            var msg = new Object();
            msg.type = "join";
            msg.data = JSON.stringify(sessionIds);
            client.send(JSON.stringify(msg));

            client.roomId = message.roomId;
            client.sessionId = message.sessionId;

            break;
          case "exchange":

            var data;

            if (message.hasOwnProperty("candidate")) {
              data = {
                from: client.sessionId,
                to: message.to,
                candidate: message.candidate,
              };
            }
            else if (message.hasOwnProperty("sdp")) {
              data = {
                from: client.sessionId,
                to: message.to,
                sdp: message.sdp,
              };
            }

            var msg = new Object();
            msg.type = "exchange";
            msg.data = JSON.stringify(data);
            client.send(JSON.stringify(msg));

            wss.clients.forEach(function (cur_client) {
              if (cur_client.sessionId === message.to && cur_client.roomId === message.roomId) {
                try {
                  cur_client.send(JSON.stringify(msg));
                } catch (e) {
                  console.log("onUserJoin:" + e.message);
                }
              }
            });
            break;
          default:
        }
      });
    });

  }
}
