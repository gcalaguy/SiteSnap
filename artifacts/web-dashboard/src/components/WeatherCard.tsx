import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sun, Cloud, CloudRain, CloudDrizzle, CloudSnow, Zap, Wind, MapPin, Droplets } from "lucide-react";

interface WeatherData {
  temperature: number;
  weatherCode: number;
  windspeed: number;
  humidity: number;
  city: string;
  region: string;
}

function getWeatherInfo(code: number): { icon: React.ReactNode; label: string; color: string } {
  if (code === 0) return { icon: <Sun className="h-8 w-8" />, label: "Clear Sky", color: "#F59E0B" };
  if (code === 1) return { icon: <Sun className="h-8 w-8" />, label: "Mostly Clear", color: "#F59E0B" };
  if (code === 2) return { icon: <Cloud className="h-8 w-8" />, label: "Partly Cloudy", color: "#6B7280" };
  if (code === 3) return { icon: <Cloud className="h-8 w-8" />, label: "Overcast", color: "#6B7280" };
  if (code === 45 || code === 48) return { icon: <Wind className="h-8 w-8" />, label: "Foggy", color: "#9CA3AF" };
  if (code >= 51 && code <= 55) return { icon: <CloudDrizzle className="h-8 w-8" />, label: "Drizzle", color: "#60A5FA" };
  if (code >= 61 && code <= 65) return { icon: <CloudRain className="h-8 w-8" />, label: "Rain", color: "#3B82F6" };
  if (code >= 71 && code <= 75) return { icon: <CloudSnow className="h-8 w-8" />, label: "Snow", color: "#93C5FD" };
  if (code >= 80 && code <= 82) return { icon: <CloudRain className="h-8 w-8" />, label: "Showers", color: "#3B82F6" };
  if (code === 85 || code === 86) return { icon: <CloudSnow className="h-8 w-8" />, label: "Snow Showers", color: "#93C5FD" };
  if (code >= 95) return { icon: <Zap className="h-8 w-8" />, label: "Thunderstorm", color: "#8B5CF6" };
  return { icon: <Cloud className="h-8 w-8" />, label: "Cloudy", color: "#6B7280" };
}

export function WeatherCard() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLoading(false);
      setDenied(true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;

          const [geoRes, weatherRes] = await Promise.all([
            fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${latitude.toFixed(4)}&lon=${longitude.toFixed(4)}&format=json`,
              { headers: { "Accept-Language": "en" } },
            ),
            fetch(
              `https://api.open-meteo.com/v1/forecast` +
                `?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}` +
                `&current=temperature_2m,weathercode,windspeed_10m,relativehumidity_2m` +
                `&temperature_unit=celsius&windspeed_unit=kmh&timezone=auto`,
            ),
          ]);

          const geoData = await geoRes.json();
          const weatherData = await weatherRes.json();

          const addr = geoData.address ?? {};
          const city =
            addr.city ?? addr.town ?? addr.village ?? addr.county ?? "Your Location";
          const region = addr.state ?? "";

          const cur = weatherData.current;
          setWeather({
            temperature: Math.round(cur.temperature_2m),
            weatherCode: cur.weathercode,
            windspeed: Math.round(cur.windspeed_10m),
            humidity: Math.round(cur.relativehumidity_2m),
            city,
            region,
          });
        } catch {
          // Fail silently — weather is non-critical
        } finally {
          setLoading(false);
        }
      },
      () => {
        setDenied(true);
        setLoading(false);
      },
      { timeout: 8000, maximumAge: 300_000 },
    );
  }, []);

  if (denied) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-4 w-4 text-muted-foreground" />
            Job Site Weather
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Enable location access in your browser to see current weather at your job site.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-4 w-4 text-muted-foreground" />
            Job Site Weather
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
            <div className="h-4 w-4 rounded-full bg-muted" />
            Getting your location…
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!weather) return null;

  const { icon, label, color } = getWeatherInfo(weather.weatherCode);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Cloud className="h-4 w-4 text-primary" />
          Job Site Weather
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center gap-1 min-w-[70px]" style={{ color }}>
            {icon}
            <span className="text-2xl font-bold" style={{ color: "inherit" }}>
              {weather.temperature}°C
            </span>
          </div>

          <div className="h-12 w-px bg-border" />

          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <div className="flex items-center gap-1 text-foreground">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm font-semibold truncate">
                {weather.city}{weather.region ? `, ${weather.region}` : ""}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">{label}</span>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Wind className="h-3 w-3" />
                <span className="text-xs">{weather.windspeed} km/h</span>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Droplets className="h-3 w-3" />
                <span className="text-xs">{weather.humidity}%</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
