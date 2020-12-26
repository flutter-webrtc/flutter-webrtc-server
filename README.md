# flutter-webrtc-server
A simple WebRTC Signaling server for flutter-webrtc and html5.

Online Demo: https://demo.cloudwebrtc.com:8086/

## Features
- Support Windows/Linux/macOS
- Built-in web, signaling, [turn server](https://github.com/pion/turn/tree/master/examples/turn-server)
- Support [REST API For Access To TURN Services](https://tools.ietf.org/html/draft-uberti-behave-turn-rest-00)
- Use [flutter-webrtc-demo](https://github.com/cloudwebrtc/flutter-webrtc-demo) for all platforms.

## Usage

### Run from source

- Clone the repository, and run.  

```bash
git clone https://github.com/cloudwebrtc/flutter-webrtc-server.git
cd flutter-webrtc-server
go run cmd/server/main.go
```

- Open https://0.0.0.0:8086 to use flutter web demo.
- If you need to test mobile app, please check the [webrtc-flutter-demo](https://github.com/cloudwebrtc/flutter-webrtc-demo). 

## Note
If you need to use it in a production environment, you need more testing.

## screenshots
# iOS/Android
<img width="180" height="320" src="screenshots/ios-01.jpeg"/> <img width="180" height="320" src="screenshots/ios-02.jpeg"/> <img width="180" height="320" src="screenshots/android-01.png"/> <img width="180" height="320" src="screenshots/android-02.png"/>

# PC/HTML5
<img width="360" height="293" src="screenshots/chrome-01.png"/> <img width="360" height="293" src="screenshots/chrome-02.png"/>
