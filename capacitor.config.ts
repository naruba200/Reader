import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.smartreader.app",
  appName: "Smart Reader",
  webDir: "dist",
  android: {
    allowMixedContent: false,
  },
};

export default config;