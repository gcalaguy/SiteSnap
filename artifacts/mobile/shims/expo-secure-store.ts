import AsyncStorage from "@react-native-async-storage/async-storage";

export async function getItemAsync(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {}
}

export async function deleteItemAsync(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {}
}

export function isAvailableAsync(): Promise<boolean> {
  return Promise.resolve(true);
}

export const AFTER_FIRST_UNLOCK: null = null;
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: null = null;
export const ALWAYS: null = null;
export const ALWAYS_THIS_DEVICE_ONLY: null = null;
export const WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: null = null;
export const WHEN_UNLOCKED: null = null;
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY: null = null;

export default {
  getItemAsync,
  setItemAsync,
  deleteItemAsync,
  isAvailableAsync,
};
