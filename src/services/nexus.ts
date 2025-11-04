// src/services/nexus.ts
import axios from "axios";

export async function listNexusMods(gameSlug: string, apiKey: string) {
  const res = await axios.get(`https://api.nexusmods.com/v1/games/${gameSlug}/mods.json`, {
    headers: { apikey: apiKey, accept: "application/json" }
  });
  return res.data; // map to local structure
}
