import AsyncStorage from "@react-native-async-storage/async-storage";

export const tokenCache = {
  async getToken(key: string): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async saveToken(key: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(key, value);
    } catch {}
  },
  async clearToken(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch {}
  },
};
