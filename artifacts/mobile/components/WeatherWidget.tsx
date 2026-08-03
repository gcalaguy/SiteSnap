import * as Location from "expo-location";
import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface WeatherData {
  temperature: number;
  weatherCode: number;
  windspeed: number;
  humidity: number;
  city: string;
  province: string;
}

type WeatherIcon =
  | "sun"
  | "cloud"
  | "wind"
  | "cloud-drizzle"
  | "cloud-rain"
  | "cloud-snow"
  | "zap";

function getWeatherInfo(code: number): { icon: WeatherIcon; label: string } {
  if (code === 0) return { icon: "sun", label: "Clear Sky" };
  if (code === 1) return { icon: "sun", label: "Mostly Clear" };
  if (code === 2) return { icon: "cloud", label: "Partly Cloudy" };
  if (code === 3) return { icon: "cloud", label: "Overcast" };
  if (code === 45 || code === 48) return { icon: "wind", label: "Foggy" };
  if (code >= 51 && code <= 55) return { icon: "cloud-drizzle", label: "Drizzle" };
  if (code >= 61 && code <= 65) return { icon: "cloud-rain", label: "Rain" };
  if (code >= 71 && code <= 75) return { icon: "cloud-snow", label: "Snow" };
  if (code >= 80 && code <= 82) return { icon: "cloud-rain", label: "Showers" };
  if (code === 85 || code === 86) return { icon: "cloud-snow", label: "Snow Showers" };
  if (code >= 95) return { icon: "zap", label: "Thunderstorm" };
  return { icon: "cloud", label: "Cloudy" };
}

function getWeatherColor(code: number): string {
  if (code === 0 || code === 1) return "#F59E0B"; // sun → amber
  if (code >= 95) return "#8B5CF6"; // storm → purple
  if ((code >= 61 && code <= 65) || (code >= 80 && code <= 82)) return "#3B82F6"; // rain → blue
  if (code >= 71 && code <= 86) return "#93C5FD"; // snow → light blue
  return "#6B7280"; // clouds/fog → grey
}

export function WeatherWidget() {
  const colors = useColors();
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web") {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchWeather() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          if (!cancelled) { setDenied(true); setLoading(false); }
          return;
        }

        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        });
        const { latitude, longitude } = pos.coords;

        // Parallel: reverse-geocode + fetch weather
        const [geoArr, resp] = await Promise.all([
          Location.reverseGeocodeAsync({ latitude, longitude }),
          fetch(
            `https://api.open-meteo.com/v1/forecast` +
              `?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}` +
              `&current=temperature_2m,weathercode,windspeed_10m,relativehumidity_2m` +
              `&temperature_unit=celsius&windspeed_unit=kmh&timezone=auto`,
          ),
        ]);

        const geo = geoArr[0];
        const city = geo?.city ?? geo?.subregion ?? geo?.district ?? "Your Location";
        const province = geo?.region ?? "";

        const data = await resp.json();
        const cur = data.current;

        if (!cancelled) {
          setWeather({
            temperature: Math.round(cur.temperature_2m),
            weatherCode: cur.weathercode,
            windspeed: Math.round(cur.windspeed_10m),
            humidity: Math.round(cur.relativehumidity_2m),
            city,
            province,
          });
        }
      } catch {
        // Weather is non-critical — fail silently
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchWeather();
    return () => { cancelled = true; };
  }, []);

  if (Platform.OS === "web" || denied) return null;

  if (loading) {
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
          Getting weather…
        </Text>
      </View>
    );
  }

  if (!weather) return null;

  const { icon, label } = getWeatherInfo(weather.weatherCode);
  const iconColor = getWeatherColor(weather.weatherCode);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Left: icon + temperature */}
      <View style={styles.left}>
        <Feather name={icon} size={30} color={iconColor} />
        <Text style={[styles.temp, { color: colors.foreground }]}>
          {weather.temperature}°C
        </Text>
      </View>

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* Right: location, condition, details */}
      <View style={styles.right}>
        <View style={styles.locationRow}>
          <Feather name="map-pin" size={12} color={colors.mutedForeground} />
          <Text
            style={[styles.locationText, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {"  "}{weather.city}
            {weather.province ? `, ${weather.province}` : ""}
          </Text>
        </View>
        <Text style={[styles.conditionText, { color: colors.mutedForeground }]}>
          {label}
        </Text>
        <View style={styles.detailRow}>
          <Feather name="wind" size={11} color={colors.mutedForeground} />
          <Text style={[styles.detailText, { color: colors.mutedForeground }]}>
            {" "}{weather.windspeed} km/h
          </Text>
          <Text style={[styles.dot, { color: colors.border }]}> · </Text>
          <Feather name="droplet" size={11} color={colors.mutedForeground} />
          <Text style={[styles.detailText, { color: colors.mutedForeground }]}>
            {" "}{weather.humidity}%
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
  },
  left: {
    alignItems: "center",
    gap: 4,
    width: 64,
  },
  temp: { fontSize: 20, fontFamily: "Inter_700Bold" },
  divider: { width: 1, alignSelf: "stretch" },
  right: { flex: 1, gap: 2 },
  locationRow: { flexDirection: "row", alignItems: "center" },
  locationText: { fontSize: 14, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  conditionText: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  detailText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  dot: { fontSize: 12 },
  loadingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
