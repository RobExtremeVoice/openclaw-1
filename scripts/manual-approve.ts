import { approveTelegramPairingCode } from "../src/telegram/pairing-store.js";

async function main() {
    const code = "X6JZXNJK";
    console.log(`Approving code: ${code}...`);
    try {
        const result = await approveTelegramPairingCode({ code });
        if (result) {
            console.log("✅ Success! Paired with ChatID:", result.chatId);
            if (result.entry?.username) {
                console.log("Username:", result.entry.username);
            }
        } else {
            console.error("❌ Failed to approve code. It might be invalid, expired, or already approved.");
        }
    } catch (err) {
        console.error("Crash:", err);
    }
}

main();
