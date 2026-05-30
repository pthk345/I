import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { subscription, time, timezone } = req.body;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: "Invalid subscription" });
    }

    // Key based on endpoint hash to avoid duplicates
    const key = `sub:${Buffer.from(subscription.endpoint).toString("base64").slice(0, 40)}`;

    await redis.set(key, JSON.stringify({ subscription, time, timezone }), {
      ex: 60 * 60 * 24 * 30, // 30 days TTL
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("subscribe error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
