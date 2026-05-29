/**
 * Shim for expo-secure-store that uses AsyncStorage as a fallback.
 * This ensures Expo Go compatibility when the native SecureStore module
 * is not available (e.g. SDK version mismatches or development clients).
 *
 * The Metro bundler intercepts all "expo-secure-store" imports and routes
 * them here, so this file must NOT import the real expo-secure-store package
 * (that would create a circular dependency).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const FALLBACK_PREFIX = "secure-store-shim::";

export async function getItemAsync(key: string): Promise<string | null> {
  return AsyncStorage.getItem(FALLBACK_PREFIX + key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  return AsyncStorage.setItem(FALLBACK_PREFIX + key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  return AsyncStorage.removeItem(FALLBACK_PREFIX + key);
}
