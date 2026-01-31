import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

import { kakaoDock, kakaoPlugin } from "./src/channel.js";
import { handleKakaoWebhookRequest } from "./src/monitor.js";
import { setKakaoRuntime } from "./src/runtime.js";

const plugin = {
  id: "kakao",
  name: "KakaoTalk",
  description: "KakaoTalk channel plugin (Kakao i Open Builder)",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setKakaoRuntime(api.runtime);
    api.registerChannel({ plugin: kakaoPlugin, dock: kakaoDock });
    api.registerHttpHandler(handleKakaoWebhookRequest);
  },
};

export default plugin;
