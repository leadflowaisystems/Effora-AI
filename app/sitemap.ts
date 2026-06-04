import { MetadataRoute } from "next";

const BASE = "https://effora-ai-qh35.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date().toISOString();
  return [
    { url: BASE,                   lastModified: now, changeFrequency: "weekly",  priority: 1.0 },
    { url: `${BASE}/pricing`,      lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/security`,     lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/privacy`,      lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/terms`,        lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/data-deletion`,lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE}/support`,      lastModified: now, changeFrequency: "monthly", priority: 0.6 },
  ];
}
