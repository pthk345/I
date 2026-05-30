import { Redis } from "@upstash/redis";
import webpush from "web-push";

const redis = Redis.fromEnv();

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL}`,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  // Allow cron (GET) and manual trigger (POST)
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Get all subscription keys
    const keys = await redis.keys("sub:*");

    if (!keys || keys.length === 0) {
      return res.status(200).json({ sent: 0, message: "No subscribers" });
    }

    const now = new Date();
    const nowUTC = now.toISOString();

    let sent = 0;
    let errors = 0;

    for (const key of keys) {
      try {
        const data = await redis.get(key);
        if (!data) continue;

        const { subscription, time, timezone } = typeof data === "string" ? JSON.parse(data) : data;

        if (!subscription || !time) continue;

        // Get current time in subscriber's timezone
        const tz = timezone || "Europe/Moscow";
        const userTime = new Intl.DateTimeFormat("ru-RU", {
          timeZone: tz,
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(now);

        // Compare HH:MM
        if (userTime === time) {
          const payload = JSON.stringify({
            title: "Вопрос дня",
            body: "Твой ежедневный вопрос ждёт тебя 💭",
            icon: "/icon-192.png",
            url: "/",
          });

          await webpush.sendNotification(subscription, payload);
          sent++;
        }
      } catch (err) {
        // If subscription is expired/invalid, delete it
        if (err.statusCode === 410 || err.statusCode === 404) {
          await redis.del(key);
        }
        errors++;
      }
    }

    return res.status(200).json({ sent, errors, checked: keys.length, time: nowUTC });
  } catch (err) {
    console.error("send-push error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
