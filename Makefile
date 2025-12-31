.PHONY: bot-start bot-stop bot-restart bot-restart-app bot-status bot-health

bot-start:
	./scripts/start-mac.sh

bot-stop:
	./scripts/stop-mac.sh

# CLI gateway restart (default: works without Swift/Xcode)
bot-restart:
	./scripts/restart-cli.sh

# macOS app restart (requires Xcode - blocked by Swift 6.2.3 bug)
bot-restart-app:
	./scripts/restart-mac.sh

bot-status:
	pnpm clawdis status

bot-health:
	pnpm clawdis gateway health
