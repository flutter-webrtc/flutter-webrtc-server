# flutter-webrtc-server
A simple WebRTC Signaling server for flutter-webrtc and html5.

## Features
- Support Windows/Linux/macOS
- Built-in web, signaling, [turn server](https://github.com/pion/turn/tree/master/examples/turn-server)
- Support [REST API For Access To TURN Services](https://tools.ietf.org/html/draft-uberti-behave-turn-rest-00)
- Use [flutter-webrtc-demo for](https://github.com/cloudwebrtc/flutter-webrtc-demo) all platforms.

## Usage

### Setup from Binary
- Download
```bash
wget https://github.com/cloudwebrtc/flutter-webrtc-server/releases/download/1.0/flutter-webrtc-server-bin-1.0.zip
mkdir flutter-webrtc-server
unzip flutter-webrtc-server-bin-1.0.zip -d flutter-webrtc-server
```
- Run
```bash
cd flutter-webrtc-server
# for macOS
./bin/server-darwin-amd64
# for Linux
./bin/server-linux-amd64
# for Windows
./bin/server-windows-i386.exe
```

### Compile from Source
- Clone the repository, run `make`.  
- Run `./bin/server-{platform}-{arch}` and open https://your_sever_ip_or_domain:4443 to use html5 demo.
- If you need to test mobile app, please check the [webrtc-flutter-demo](https://github.com/cloudwebrtc/flutter-webrtc-demo/tree/golang). 

## Note
This example can only be used for LAN testing. If you need to use it in a production environment, you need more testing and and deploy an available turn server.

## screenshots
# iOS/Android
<img width="180" height="320" src="https://raw.githubusercontent.com/cloudwebrtc/flutter-webrtc-server/master/screenshots/ios-01.jpeg"/> <img width="180" height="320" src="https://raw.githubusercontent.com/cloudwebrtc/flutter-webrtc-server/master/screenshots/ios-02.jpeg"/> <img width="180" height="320" src="https://raw.githubusercontent.com/cloudwebrtc/flutter-webrtc-server/master/screenshots/android-01.png"/> <img width="180" height="320" src="https://raw.githubusercontent.com/cloudwebrtc/flutter-webrtc-server/master/screenshots/android-02.png"/>

# PC/HTML5
<img width="360" height="293" src="https://raw.githubusercontent.com/cloudwebrtc/flutter-webrtc-server/master/screenshots/chrome-01.png"/> <img width="360" height="293" src="https://raw.githubusercontent.com/cloudwebrtc/flutter-webrtc-server/master/screenshots/chrome-02.png"/>
