---
name: elevenlabs-tts
description: Text-to-speech and speech-to-text using ElevenLabs API.
homepage: https://elevenlabs.io/docs/api-reference/text-to-speech
metadata: {"clawdis":{"emoji":"🔊","requires":{"bins":["curl","jq"],"env":["ELEVENLABS_API_KEY"]}}}
---

# ElevenLabs TTS & STT

Generate natural-sounding audio from text (TTS) and transcribe audio to text (STT) using ElevenLabs API.
Free tier: 10,000 characters/month for TTS.

## Quick start

```bash
{baseDir}/scripts/speak.sh "Hello, this is Zee speaking" --out /tmp/speech.mp3
```

## Options

- `--voice`: Voice ID (default: Rachel - 21m00Tcm4TlvDq8ikWAM)
- `--model`: eleven_monolingual_v1, eleven_multilingual_v2 (default: eleven_monolingual_v1)
- `--out`: Output file path (required)

## Common Voice IDs

- Rachel: `21m00Tcm4TlvDq8ikWAM` (default, American female)
- Domi: `AZnzlk1XvdvUeBnXmlld` (American female)
- Bella: `EXAVITQu4vr4xnSDxMaL` (American female)
- Antoni: `ErXwobaYiN019PkySvjV` (American male)
- Josh: `TxGEqnHWrfWFTfGW9XjX` (American male)
- Arnold: `VR6AewLTigWG4xSOukaG` (American male)
- Adam: `pNInz6obpgDQGcFmaJgB` (American male)
- Sam: `yoZ06aMxZJJ28mfd3POQ` (American male)

## Speech-to-Text (Transcription)

Transcribe audio files using ElevenLabs Scribe model:

```bash
{baseDir}/scripts/transcribe.sh /path/to/audio.ogg
```

Outputs transcript text to stdout. Supports most audio formats (ogg, mp3, wav, m4a, etc.).

## API key

Set `ELEVENLABS_API_KEY` environment variable. Get your API key from:
https://elevenlabs.io/app/settings/api-keys
