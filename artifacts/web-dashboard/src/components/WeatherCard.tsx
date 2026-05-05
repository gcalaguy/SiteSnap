import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sun, Cloud, CloudRain, CloudDrizzle, CloudSnow, Zap, Wind, MapPin, Droplets } from "lucide-react";

const GOLD = "#C9A84C";
const BLACK = "#111111";

interface WeatherData {
  temperature: number;
  weatherCode: number;
  windspeed: number;
  humidity: number;
  city: string;
  region: string;
}

function getWeatherInfo(code: number): { icon: React.ReactNode; label: string } {
  if (code === 0) return { icon: <Sun className="h-8 w-8" style={{ color: GOLD }} />, label: "Clear Sky" };
  if (code === 1) return { icon: <Sun className="h-8 w-8" style={{ color: GOLD }} />, label: "Mostly Clear" };
  if (code === 2) return { icon: <Cloud className="h-8 w-8" style={{ color: GOLD }} />, label: "Partly Cloudy" };
  if (code === 3) return { icon: <Cloud className="h-8 w-8" style={{ color: GOLD }} />, label: "Overcast" };
  if (code === 45 || code === 48) return { icon: <Wind className="h-8 w-8" style={{ color: GOLD }} />, label: "Foggy" };
  if (code >= 51 && code <= 55) return { icon: <CloudDrizzle className="h-8 w-8" style={{ color: GOLD }} />, label: "Drizzle" };
  if (code >= 61 && code <= 65) return { icon: <CloudRain className="h-8 w-8" style={{ color: GOLD }} />, label: "Rain" };
  if (code >= 71 && code <= 75) return { icon: <CloudSnow className="h-8 w-8" style={{ color: GOLD }} />, label: "Snow" };
  if (code >= 80 && code <= 82) return { icon: <CloudRain className="h-8 w-8" style={{ color: GOLD }} />, label: "Showers" };
  if (code === 85 || code === 86) return { icon: <CloudSnow className="h-8 w-8" style={{ color: GOLD }} />, label: "Snow Showers" };
  if (code >= 95) return { icon: <Zap className="h-8 w-8" style={{ color: GOLD }} />, label: "Thunderstorm" };
  return { icon: <Cloud className="h-8 w-8" style={{ color: GOLD }} />, label: "Cloudy" };
}

const cardStyle = { background: BLACK, border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" };

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
      <Card style={cardStyle}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold" style={{ color: GOLD }}>
            <Cloud className="h-4 w-4" style={{ color: GOLD }} />
            Job Site Weather
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-500">
            Enable location access in your browser to see current weather at your job site.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card style={cardStyle}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold" style={{ color: GOLD }}>
            <Cloud className="h-4 w-4" style={{ color: GOLD }} />
            Job Site Weather
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-zinc-500 animate-pulse">
            <div className="h-4 w-4 rounded-full bg-zinc-700" />
            Getting your location…
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!weather) return null;

  const { icon, label } = getWeatherInfo(weather.weatherCode);

  return (
    <Card style={cardStyle}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2" style={{ color: GOLD }}>
          <Cloud className="h-4 w-4" style={{ color: GOLD }} />
          Job Site Weather
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center gap-1 min-w-[70px]">
            {icon}
            <span className="text-2xl font-bold text-white">
              {weather.temperature}°C
            </span>
          </div>

          <div className="h-12 w-px" style={{ background: "#2a2a2a" }} />

          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: GOLD }} />
              <span className="text-sm font-semibold truncate" style={{ color: GOLD }}>
                {weather.city}{weather.region ? `, ${weather.region}` : ""}
              </span>
            </div>
            <span className="text-xs text-zinc-500">{label}</span>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center gap-1 text-zinc-500">
                <Wind className="h-3 w-3" style={{ color: GOLD }} />
                <span className="text-xs">{weather.windspeed} km/h</span>
              </div>
              <div className="flex items-center gap-1 text-zinc-500">
                <Droplets className="h-3 w-3" style={{ color: GOLD }} />
                <span className="text-xs">{weather.humidity}%</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
