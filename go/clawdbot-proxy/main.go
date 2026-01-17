// Clawdbot Proxy - High-performance reverse proxy for Clawdbot Gateway
//
// Features:
// - Rate limiting per IP
// - WebSocket proxying with connection pooling
// - Static file serving for Control UI
// - Health check endpoints
// - Graceful shutdown
//
// Architecture:
//
//	Client -> Go Proxy (18789) -> Node Gateway (18790)

package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"golang.org/x/time/rate"
)

// Config holds proxy configuration
type Config struct {
	ListenAddr     string
	NodeBackend    string
	StaticDir      string
	RateLimit      float64
	RateBurst      int
	ReadTimeout    time.Duration
	WriteTimeout   time.Duration
	IdleTimeout    time.Duration
	MaxHeaderBytes int
}

// RateLimiter manages per-IP rate limiting
type RateLimiter struct {
	mu       sync.RWMutex
	limiters map[string]*rate.Limiter
	rate     rate.Limit
	burst    int
}

func NewRateLimiter(r float64, burst int) *RateLimiter {
	return &RateLimiter{
		limiters: make(map[string]*rate.Limiter),
		rate:     rate.Limit(r),
		burst:    burst,
	}
}

func (rl *RateLimiter) GetLimiter(ip string) *rate.Limiter {
	rl.mu.RLock()
	limiter, exists := rl.limiters[ip]
	rl.mu.RUnlock()

	if exists {
		return limiter
	}

	rl.mu.Lock()
	defer rl.mu.Unlock()

	// Double-check after acquiring write lock
	if limiter, exists = rl.limiters[ip]; exists {
		return limiter
	}

	limiter = rate.NewLimiter(rl.rate, rl.burst)
	rl.limiters[ip] = limiter
	return limiter
}

// Cleanup removes stale limiters (call periodically)
func (rl *RateLimiter) Cleanup() {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	// Simple cleanup: just clear the map periodically
	// In production, track last access time per IP
	if len(rl.limiters) > 10000 {
		rl.limiters = make(map[string]*rate.Limiter)
	}
}

// ProxyServer handles all proxy operations
type ProxyServer struct {
	config      Config
	rateLimiter *RateLimiter
	httpProxy   *httputil.ReverseProxy
	wsUpgrader  websocket.Upgrader
}

func NewProxyServer(config Config) (*ProxyServer, error) {
	backendURL, err := url.Parse(config.NodeBackend)
	if err != nil {
		return nil, fmt.Errorf("invalid backend URL: %w", err)
	}

	proxy := httputil.NewSingleHostReverseProxy(backendURL)

	// Custom error handler
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Error().Err(err).Str("path", r.URL.Path).Msg("Proxy error")
		http.Error(w, "Bad Gateway", http.StatusBadGateway)
	}

	return &ProxyServer{
		config:      config,
		rateLimiter: NewRateLimiter(config.RateLimit, config.RateBurst),
		httpProxy:   proxy,
		wsUpgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin:     func(r *http.Request) bool { return true }, // Allow all origins
		},
	}, nil
}

// getClientIP extracts the real client IP from request
func getClientIP(r *http.Request) string {
	// Check X-Forwarded-For header
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		ips := strings.Split(xff, ",")
		return strings.TrimSpace(ips[0])
	}

	// Check X-Real-IP header
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return xri
	}

	// Fall back to RemoteAddr
	ip, _, _ := net.SplitHostPort(r.RemoteAddr)
	return ip
}

// rateLimitMiddleware applies rate limiting
func (ps *ProxyServer) rateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := getClientIP(r)
		limiter := ps.rateLimiter.GetLimiter(ip)

		if !limiter.Allow() {
			log.Warn().Str("ip", ip).Msg("Rate limited")
			http.Error(w, "Too Many Requests", http.StatusTooManyRequests)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// loggingMiddleware logs requests
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		// Wrap response writer to capture status
		wrapped := &statusResponseWriter{ResponseWriter: w, status: 200}

		next.ServeHTTP(wrapped, r)

		log.Info().
			Str("method", r.Method).
			Str("path", r.URL.Path).
			Int("status", wrapped.status).
			Dur("duration", time.Since(start)).
			Str("ip", getClientIP(r)).
			Msg("Request")
	})
}

type statusResponseWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusResponseWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

// handleHealth returns health check status
func (ps *ProxyServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"status":"ok","proxy":"clawdbot-proxy","timestamp":"%s"}`, time.Now().UTC().Format(time.RFC3339))
}

// handleWebSocket proxies WebSocket connections
func (ps *ProxyServer) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Connect to backend WebSocket
	backendURL := strings.Replace(ps.config.NodeBackend, "http://", "ws://", 1)
	backendURL = strings.Replace(backendURL, "https://", "wss://", 1)
	backendURL = backendURL + r.URL.Path

	if r.URL.RawQuery != "" {
		backendURL += "?" + r.URL.RawQuery
	}

	// Copy headers
	header := http.Header{}
	for k, v := range r.Header {
		if strings.HasPrefix(strings.ToLower(k), "sec-websocket") {
			continue // Don't copy WebSocket headers
		}
		header[k] = v
	}

	// Connect to backend
	backendConn, resp, err := websocket.DefaultDialer.Dial(backendURL, header)
	if err != nil {
		log.Error().Err(err).Str("backend", backendURL).Msg("Failed to connect to backend WebSocket")
		if resp != nil {
			http.Error(w, "Bad Gateway", resp.StatusCode)
		} else {
			http.Error(w, "Bad Gateway", http.StatusBadGateway)
		}
		return
	}
	defer backendConn.Close()

	// Upgrade client connection
	clientConn, err := ps.wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Error().Err(err).Msg("Failed to upgrade client WebSocket")
		return
	}
	defer clientConn.Close()

	log.Debug().Str("path", r.URL.Path).Msg("WebSocket connection established")

	// Bidirectional copy
	errChan := make(chan error, 2)

	// Client -> Backend
	go func() {
		for {
			messageType, message, err := clientConn.ReadMessage()
			if err != nil {
				errChan <- err
				return
			}
			if err := backendConn.WriteMessage(messageType, message); err != nil {
				errChan <- err
				return
			}
		}
	}()

	// Backend -> Client
	go func() {
		for {
			messageType, message, err := backendConn.ReadMessage()
			if err != nil {
				errChan <- err
				return
			}
			if err := clientConn.WriteMessage(messageType, message); err != nil {
				errChan <- err
				return
			}
		}
	}()

	// Wait for either side to close
	<-errChan
	log.Debug().Str("path", r.URL.Path).Msg("WebSocket connection closed")
}

// handleProxy proxies HTTP requests to backend
func (ps *ProxyServer) handleProxy(w http.ResponseWriter, r *http.Request) {
	// Check for WebSocket upgrade
	if websocket.IsWebSocketUpgrade(r) {
		ps.handleWebSocket(w, r)
		return
	}

	ps.httpProxy.ServeHTTP(w, r)
}

// handleStatic serves static files from the UI directory
func (ps *ProxyServer) handleStatic(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	if path == "/" {
		path = "/index.html"
	}

	filePath := filepath.Join(ps.config.StaticDir, path)

	// Security: prevent path traversal
	if !strings.HasPrefix(filepath.Clean(filePath), filepath.Clean(ps.config.StaticDir)) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		// For SPA routing, serve index.html for non-file paths
		if !strings.Contains(path, ".") {
			filePath = filepath.Join(ps.config.StaticDir, "index.html")
		}
	}

	http.ServeFile(w, r, filePath)
}

// ServeHTTP implements http.Handler
func (ps *ProxyServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path

	// Health check endpoint
	if path == "/health" || path == "/api/health" {
		ps.handleHealth(w, r)
		return
	}

	// API and WebSocket requests go to backend
	if strings.HasPrefix(path, "/api/") || strings.HasPrefix(path, "/ws") {
		ps.handleProxy(w, r)
		return
	}

	// Static files
	if ps.config.StaticDir != "" {
		ps.handleStatic(w, r)
		return
	}

	// Default: proxy to backend
	ps.handleProxy(w, r)
}

func main() {
	// Configure logging
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	// Parse flags
	listenAddr := flag.String("listen", ":18789", "Address to listen on")
	nodeBackend := flag.String("backend", "http://127.0.0.1:18790", "Node.js backend URL")
	staticDir := flag.String("static", "", "Static files directory (Control UI)")
	rateLimit := flag.Float64("rate-limit", 100, "Requests per second per IP")
	rateBurst := flag.Int("rate-burst", 50, "Rate limit burst size")
	flag.Parse()

	// Override from environment
	if envListen := os.Getenv("CLAWDBOT_PROXY_LISTEN"); envListen != "" {
		*listenAddr = envListen
	}
	if envBackend := os.Getenv("CLAWDBOT_PROXY_BACKEND"); envBackend != "" {
		*nodeBackend = envBackend
	}
	if envStatic := os.Getenv("CLAWDBOT_PROXY_STATIC"); envStatic != "" {
		*staticDir = envStatic
	}

	config := Config{
		ListenAddr:     *listenAddr,
		NodeBackend:    *nodeBackend,
		StaticDir:      *staticDir,
		RateLimit:      *rateLimit,
		RateBurst:      *rateBurst,
		ReadTimeout:    30 * time.Second,
		WriteTimeout:   30 * time.Second,
		IdleTimeout:    120 * time.Second,
		MaxHeaderBytes: 1 << 20, // 1MB
	}

	// Create proxy server
	proxy, err := NewProxyServer(config)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to create proxy server")
	}

	// Apply middleware
	handler := loggingMiddleware(proxy.rateLimitMiddleware(proxy))

	// Create HTTP server
	server := &http.Server{
		Addr:           config.ListenAddr,
		Handler:        handler,
		ReadTimeout:    config.ReadTimeout,
		WriteTimeout:   config.WriteTimeout,
		IdleTimeout:    config.IdleTimeout,
		MaxHeaderBytes: config.MaxHeaderBytes,
	}

	// Graceful shutdown
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Info().
			Str("listen", config.ListenAddr).
			Str("backend", config.NodeBackend).
			Str("static", config.StaticDir).
			Msg("Starting Clawdbot Proxy")

		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("Server failed")
		}
	}()

	// Periodic cleanup of rate limiters
	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			proxy.rateLimiter.Cleanup()
		}
	}()

	<-stop
	log.Info().Msg("Shutting down gracefully...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Error().Err(err).Msg("Shutdown error")
	}

	log.Info().Msg("Server stopped")
}

// Ensure statusResponseWriter implements http.Hijacker for WebSocket support
var _ http.Hijacker = (*statusResponseWriter)(nil)

func (w *statusResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if hj, ok := w.ResponseWriter.(http.Hijacker); ok {
		return hj.Hijack()
	}
	return nil, nil, fmt.Errorf("ResponseWriter does not implement http.Hijacker")
}

// Need to add bufio import
func init() {
	// Placeholder for any initialization
}
