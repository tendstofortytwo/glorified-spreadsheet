package main

import (
	"flag"
	"io"
	"log"
	"net"
	"os"
	"os/exec"

	"tailscale.com/tsnet"
)

func handle(err error) {
	if err != nil {
		panic(err)
	}
}

var (
	hostname   = flag.String("hostname", "glorified-spreadsheet", "tailscale hostname")
	entrypoint = flag.String("entrypoint", "index.js", "path to js file to run")
	port       = flag.String("port", "3000", "port js file listens on")
)

func main() {
	flag.Parse()
	srv := &tsnet.Server{
		Dir:      "./tsproxy-state/",
		Hostname: *hostname,
	}
	cmd := exec.Command("node", *entrypoint)
	cmd.Stderr = os.Stderr
	cmd.Stdout = os.Stdout
	err := cmd.Start()
	handle(err)
	ln, err := srv.ListenTLS("tcp", ":443")
	handle(err)
	log.Printf("tsproxy forwarding from https://%s to localhost:%v\n", *hostname, *port)
	done := make(chan bool)
	go func() {
		for {
			select {
			case <-done:
				break
			default:
				conn, err := ln.Accept()
				if err != nil {
					log.Printf("tsproxy couldn't accept connection: %v\n", err)
					continue
				}
				go forward(conn, *port)
			}
		}
	}()
	err = cmd.Wait()
	log.Printf("node exited with err: %v\n", err)
	done <- true
}

func forward(conn net.Conn, port string) {
	fwd, err := net.Dial("tcp", net.JoinHostPort("localhost", port))
	if err != nil {
		log.Printf("tsproxy couldn't connect to js backend: %v\n", err)
	}
	go func() {
		_, err := io.Copy(conn, fwd)
		if err != nil {
			log.Printf("tsproxy conn to backend err: %v\n", err)
		}
	}()
	_, err = io.Copy(fwd, conn)
	if err != nil {
		log.Printf("tsproxy conn from backend err: %v\n", err)
	}
}
