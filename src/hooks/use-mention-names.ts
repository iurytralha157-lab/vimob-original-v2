import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve raw phone digits (as found in WhatsApp group mentions like @5511999998888)
 * to a human-friendly display name.
 *
 * Lookup order:
 *  1) whatsapp_conversations.contact_name (matched by contact_phone normalized)
 *  2) leads.name (matched by phone column normalized)
 *  3) Fallback: formatted phone number
 *
 * Uses a module-level cache so the same phone resolves only once per session.
 */

type CacheValue = string | null; // null = pending
const cache = new Map<string, CacheValue>();
const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach((cb) => cb());
}

function normalize(raw: string): string {
  // Keep digits only; strip optional 55 country code prefix for matching variants
  return raw.replace(/\D/g, "");
}

function formatPhone(digits: string): string {
  const d = digits.startsWith("55") ? digits.slice(2) : digits;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digits;
}

async function fetchName(digits: string): Promise<string> {
  const noCountry = digits.startsWith("55") ? digits.slice(2) : digits;
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  const variants = Array.from(new Set([digits, noCountry, withCountry]));

  // 1) WhatsApp contacts (most accurate for group mentions)
  try {
    const { data } = await supabase
      .from("whatsapp_conversations")
      .select("contact_name, contact_phone")
      .in("contact_phone", variants)
      .not("contact_name", "is", null)
      .limit(1);
    if (data?.[0]?.contact_name) return data[0].contact_name as string;
  } catch {
    // noop
  }

  // 2) Leads
  try {
    const { data } = await supabase
      .from("leads")
      .select("name, phone")
      .in("phone", variants)
      .limit(1);
    if (data?.[0]?.name) return data[0].name as string;
  } catch {
    // noop
  }

  // 3) Fallback formatted phone
  return formatPhone(digits);
}

export function useMentionNames(rawDigitsList: string[]): Record<string, string> {
  const [, force] = useState(0);

  useEffect(() => {
    const cb = () => force((n) => n + 1);
    subscribers.add(cb);
    return () => {
      subscribers.delete(cb);
    };
  }, []);

  useEffect(() => {
    const toFetch = rawDigitsList
      .map(normalize)
      .filter((d) => d && !cache.has(d));
    if (toFetch.length === 0) return;

    toFetch.forEach((d) => cache.set(d, null)); // pending marker
    Promise.all(
      toFetch.map(async (d) => {
        const name = await fetchName(d);
        cache.set(d, name);
      }),
    ).then(() => notify());
  }, [rawDigitsList.join(",")]);

  const result: Record<string, string> = {};
  for (const raw of rawDigitsList) {
    const d = normalize(raw);
    const v = cache.get(d);
    result[raw] = v && typeof v === "string" ? v : formatPhone(d);
  }
  return result;
}
