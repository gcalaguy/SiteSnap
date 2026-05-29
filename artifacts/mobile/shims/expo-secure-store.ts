import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_PREFIX = "secure-store-shim:";

export async function getItemAsync(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(`${KEY_PREFIX}${key}`);
  } catch {
    return null;
  }
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(`${KEY_PREFIX}${key}`, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  await AsyncStorage.removeItem(`${KEY_PREFIX}${key}`);
}

// When-available flag (simulated)
export const WHEN_UNLOCKED = "WHEN_UNLOCKED";
export const WHEN_UNLOCKED_THIS_TIME_DEVICE = "WHEN_UNLOCKED_THIS_TIME_DEVICE";
export const AFTER_FIRST_UNLOCK = "AFTER_FIRST_UNLOCK";
export const AFTER_FIRST_UNLOCK_THIS_TIME_DEVICE = "AFTER_FIRST_UNLOCK_THIS_TIME_DEVICE";
export const ALWAYS = "ALWAYS";
export const ALWAYS_THIS_TIME_DEVICE = "ALWAYS_THIS_TIME_DEVICE";

export async function isAvailableAsync(): Promise<boolean> {
  return true;
}
