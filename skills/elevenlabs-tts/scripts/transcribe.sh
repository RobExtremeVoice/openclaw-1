#!/usr/bin/env bash
set -euo pipefail

# ElevenLabs Speech-to-Text (Scribe) script
# Usage: transcribe.sh /path/to/audio.ogg
# Outputs transcript text to stdout

if [[ $# -lt 1 ]]; then
  echo "Usage: transcribe.sh <audio-file>" >&2
  exit 1
fi

AUDIO_FILE="$1"

if [[ ! -f "$AUDIO_FILE" ]]; then
  echo "Error: File not found: $AUDIO_FILE" >&2
  exit 1
fi

if [[ -z "${ELEVENLABS_API_KEY:-}" ]]; then
  echo "Error: ELEVENLABS_API_KEY environment variable required" >&2
  exit 1
fi

# Call ElevenLabs Speech-to-Text API
RESPONSE=$(curl -s "https://api.elevenlabs.io/v1/speech-to-text" \
  -H "xi-api-key: ${ELEVENLABS_API_KEY}" \
  -F "model_id=scribe_v1" \
  -F "file=@${AUDIO_FILE}")

# Extract text from JSON response
echo "$RESPONSE" | jq -r '.text // empty'
