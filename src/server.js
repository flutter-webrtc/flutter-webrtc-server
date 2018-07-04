var express = require('express');
var app = express();
var fs = require('fs');
var open = require('open');
var options = {
  key: fs.readFileSync('../certs/key.pem'),
  cert: fs.readFileSync('../certs/cert.pem')
};
var serverPort = (process.env.PORT  || 4443);
var https = require('https');
var http = require('http');
var server;
server = https.createServer(options, app);
// if (process.env.LOCAL) {
//   server = https.createServer(options, app);
// } else {
//   server = http.createServer(app);
// }
var io = require('socket.io')(server);

var roomList = {};

app.get('/', function(req, res){
  console.log('get /');
});
server.listen(serverPort, function(){
  console.log('server up and running at %s port', serverPort);
  if (process.env.LOCAL) {
    open('https://localhost:' + serverPort)
  }
});

function socketIdsInRoom(name) {
  var socketIds = io.nsps['/'].adapter.rooms[name];
  if (socketIds) {
    var collection = [];
    for (var key in socketIds) {
      collection.push(key);
    }
    return collection;
  } else {
    return [];
  }
}

io.on('connection', function(socket){
  console.log('connection');
  socket.on('disconnect', function(){
    console.log('disconnect');
    if (socket.room) {
      var room = socket.room;
      io.to(room).emit('leave', socket.id);
      socket.leave(room);
    }
  });

  socket.on('join', function(name, callback){
    console.log('join', name);
    var socketIds = socketIdsInRoom(name);
    callback(socketIds);
    socket.join(name);
    socket.room = name;
  });


  socket.on('exchange', function(data){
    console.log('exchange', data);
    data.from = socket.id;
    var to = io.sockets.connected[data.to];
    to.emit('exchange', data);
  });
});
