---
name: grounding-lite
description: Google Maps Grounding Lite MCP for AI-powered location search, weather, and routes via mcporter.
homepage: https://developers.google.com/maps/ai/grounding-lite
metadata: {"clawdbot":{"emoji":"🗺️","requires":{"bins":["mcporter"],"env":["GOOGLE_MAPS_API_KEY"]},"primaryEnv":"GOOGLE_MAPS_API_KEY","install":[{"id":"node","kind":"node","package":"mcporter","bins":["mcporter"],"label":"Install mcporter (npm)"}]}}
---

# Grounding Lite

Google Maps Grounding Lite MCP for AI-grounded location data. Experimental (pre-GA), free during preview.

Setup
- Configure once: `mcporter config add grounding-lite --url https://mapstools.googleapis.com/mcp --header "X-Goog-Api-Key=$GOOGLE_MAPS_API_KEY"`
- Or ad-hoc: `mcporter call "https://mapstools.googleapis.com/mcp.search_places" --header "X-Goog-Api-Key=$GOOGLE_MAPS_API_KEY" text_query="..."`

Search places
- `mcporter call grounding-lite.search_places text_query="coffee shops near Central Park"`
- With bias: `mcporter call grounding-lite.search_places text_query="pizza" location_bias='{"center":{"latitude":40.7829,"longitude":-73.9654},"radius":2000}'`

Lookup weather
- `mcporter call grounding-lite.lookup_weather location='{"address":"San Francisco, CA"}' units_system=IMPERIAL`
- By coords: `mcporter call grounding-lite.lookup_weather location='{"lat_lng":{"latitude":37.77,"longitude":-122.41}}'`
- Forecast: `mcporter call grounding-lite.lookup_weather location='{"address":"New York, NY"}' date='{"year":2026,"month":1,"day":28}' hour=14`

Compute routes
- `mcporter call grounding-lite.compute_routes origin='{"address":"San Francisco, CA"}' destination='{"address":"Los Angeles, CA"}' travel_mode=DRIVE`
- Walking: `mcporter call grounding-lite.compute_routes origin='{"address":"Times Square, NYC"}' destination='{"address":"Central Park, NYC"}' travel_mode=WALK`

List tools
- `mcporter list grounding-lite --schema`

Notes
- Rate limits: search_places (100 QPM, 1K QPD), lookup_weather (300 QPM), compute_routes (300 QPM)
- Weather has regional restrictions (US locations work; some international may not)
- Responses include Google Maps links - include in user-facing output
- API key security: restrict to `mapstools.googleapis.com` in Cloud Console
