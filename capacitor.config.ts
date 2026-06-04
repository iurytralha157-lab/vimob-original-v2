import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.106c422f8c2149a5968a18f4ac50cb74',
  appName: 'vimobe',
  webDir: 'dist',
  server: {
    url: 'https://106c422f-8c21-49a5-968a-18f4ac50cb74.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  ios: {
    contentInset: 'automatic',
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
