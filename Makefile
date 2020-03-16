VERSION=$(shell git describe --tags)
LDFLAGS=-ldflags "-s -w"

all: linux darwin windows

release: all zip

clean:
	rm -rf bin/* *.zip

upx:
	upx -9 bin/*

linux:
	CGO_ENABLE=0 GOOS=linux GOARCH=amd64 go build -o bin/server-linux-amd64 ${LDFLAGS} cmd/server/main.go
	CGO_ENABLE=0 GOOS=linux GOARCH=386 go build -o bin/server-linux-i386 ${LDFLAGS} cmd/server/main.go

darwin:
	CGO_ENABLE=0 GOOS=darwin GOARCH=amd64 go build -o bin/server-darwin-amd64 ${LDFLAGS} cmd/server/main.go

windows:
	CGO_ENABLE=0 GOOS=windows GOARCH=amd64 go build -o bin/server-windows-amd64.exe ${LDFLAGS} cmd/server/main.go
	CGO_ENABLE=0 GOOS=windows GOARCH=386 go build -o bin/server-windows-i386.exe ${LDFLAGS} cmd/server/main.go

zip:
	zip -r flutter-webrtc-server-bin-${VERSION}.zip bin configs web
