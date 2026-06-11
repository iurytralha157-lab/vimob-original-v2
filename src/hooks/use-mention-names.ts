import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve raw phone digits (as found in WhatsApp group mentions like @5511999998888)
 * to a human-friendly display name.
 *
 * Lookup order:
 *  1) whatsapp_groups.participants for the active group (JID/LID/PhoneNumber)
 *  2) whatsapp_messages.sender_name in that group
 *  3) whatsapp_conversations.contact_name (matched by contact_phone/remote_jid)
 *  4) leads.name (matched by phone column normalized)
 *  5) Fallback: formatted phone number
 *
 * Uses a module-level cache so the same phone resolves only once per session.
 */

type MentionLookupContext = {
  groupJid?: string | null;
  sessionId?: string | null;
};

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

function normalizeJid(value: unknown): string {
  return String(value || "").trim();
}

function cacheKey(digits: string, context?: MentionLookupContext): string {
  return `${context?.groupJid || "global"}:${context?.sessionId || "any"}:${digits}`;
}

function formatPhone(digits: string): string {
  const d = digits.startsWith("55") ? digits.slice(2) : digits;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digits;
}

function buildDigitVariants(digits: string): string[] {
  const noCountry = digits.startsWith("55") ? digits.slice(2) : digits;
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return Array.from(new Set([digits, noCountry, withCountry].filter(Boolean)));
}

function buildJidVariants(digits: string): string[] {
  return buildDigitVariants(digits).flatMap((variant) => [
    variant,
    `${variant}@s.whatsapp.net`,
    `${variant}@c.us`,
    `${variant}@lid`,
  ]);
}

function isUsefulName(value: unknown, digits: string): value is string {
  const text = String(value || "").trim();
  if (!text) return false;
  if (text.includes("@")) return false;
  return normalize(text) !== digits;
}

function getParticipantName(participant: any, digits: string): string | null {
  const candidates = [
    participant?.DisplayName,
    participant?.displayName,
    participant?.Notify,
    participant?.notify,
    participant?.Name,
    participant?.name,
    participant?.pushName,
    participant?.PushName,
    participant?.verifiedName,
    participant?.VerifiedName,
  ];

  const name = candidates.find((candidate) => isUsefulName(candidate, digits));
  return name ? String(name).trim() : null;
}

function getParticipantIdentifiers(participant: any): string[] {
  if (typeof participant === "string") return [participant];
  return [
    participant?.id,
    participant?.ID,
    participant?.jid,
    participant?.JID,
    participant?.lid,
    participant?.LID,
    participant?.phone,
    participant?.Phone,
    participant?.phoneNumber,
    participant?.PhoneNumber,
    participant?.participant,
    participant?.Participant,
  ].map(normalizeJid).filter(Boolean);
}

function findParticipant(participants: any[], digits: string): any | null {
  const digitVariants = new Set(buildDigitVariants(digits));
  const jidVariants = new Set(buildJidVariants(digits));

  return participants.find((participant) => {
    const identifiers = getParticipantIdentifiers(participant);
    return identifiers.some((identifier) => {
      const clean = normalize(identifier);
      return identifier === digits || jidVariants.has(identifier) || digitVariants.has(clean);
    });
  }) || null;
}

async function fetchMessageSenderName(digits: string, context?: MentionLookupContext): Promise<string | null> {
  if (!context?.groupJid) return null;

  try {
    let conversationsQuery = supabase
      .from("whatsapp_conversations")
      .select("id")
      .eq("remote_jid", context.groupJid)
      .eq("is_group", true);

    if (context.sessionId) {
      conversationsQuery = conversationsQuery.eq("session_id", context.sessionId);
    }

    const { data: conversations } = await conversationsQuery.limit(5);
    const conversationIds = (conversations || []).map((conversation: any) => conversation.id).filter(Boolean);
    if (conversationIds.length === 0) return null;

    const { data } = await supabase
      .from("whatsapp_messages")
      .select("sender_name, sender_jid")
      .in("conversation_id", conversationIds)
      .in("sender_jid", buildJidVariants(digits))
      .not("sender_name", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1);

    const name = data?.[0]?.sender_name;
    return isUsefulName(name, digits) ? name : null;
  } catch {
    return null;
  }
}

async function fetchGroupParticipantName(digits: string, context?: MentionLookupContext): Promise<string | null> {
  if (!context?.groupJid) return null;

  try {
    let query = supabase
      .from("whatsapp_groups")
      .select("participants")
      .eq("group_jid", context.groupJid);

    if (context.sessionId) {
      query = query.eq("session_id", context.sessionId);
    }

    const { data } = await query.limit(3);
    for (const group of data || []) {
      const participants = Array.isArray(group.participants) ? group.participants : [];
      const participant = findParticipant(participants, digits);
      if (!participant) continue;

      const participantName = getParticipantName(participant, digits);
      if (participantName) return participantName;

      const phoneDigits = normalize(
        participant?.PhoneNumber || participant?.phoneNumber || participant?.phone || participant?.Phone || "",
      );
      if (phoneDigits && phoneDigits !== digits) {
        const knownName = await fetchKnownContactName(phoneDigits, context);
        if (knownName) return knownName;
      }
    }
  } catch {
    // noop
  }

  return null;
}

async function fetchKnownContactName(digits: string, context?: MentionLookupContext): Promise<string | null> {
  const variants = buildDigitVariants(digits);
  const jidVariants = buildJidVariants(digits);

  const senderName = await fetchMessageSenderName(digits, context);
  if (senderName) return senderName;

  // WhatsApp contacts (most accurate for known phone numbers)
  try {
    const { data } = await supabase
      .from("whatsapp_conversations")
      .select("contact_name, contact_phone, remote_jid")
      .or(`contact_phone.in.(${variants.join(",")}),remote_jid.in.(${jidVariants.join(",")})`)
      .not("contact_name", "is", null)
      .limit(1);
    const name = data?.[0]?.contact_name;
    if (isUsefulName(name, digits)) return name;
  } catch {
    // noop
  }

  // Leads
  try {
    const { data } = await supabase
      .from("leads")
      .select("name, phone")
      .in("phone", variants)
      .limit(1);
    const name = data?.[0]?.name;
    if (isUsefulName(name, digits)) return name;
  } catch {
    // noop
  }

  return null;
}

async function fetchName(digits: string, context?: MentionLookupContext): Promise<string> {
  const groupName = await fetchGroupParticipantName(digits, context);
  if (groupName) return groupName;

  const knownName = await fetchKnownContactName(digits, context);
  if (knownName) return knownName;

  return formatPhone(digits);
}

export function useMentionNames(rawDigitsList: string[], context?: MentionLookupContext): Record<string, string> {
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
      .filter((d) => d && !cache.has(cacheKey(d, context)));
    if (toFetch.length === 0) return;

    toFetch.forEach((d) => cache.set(cacheKey(d, context), null)); // pending marker
    Promise.all(
      toFetch.map(async (d) => {
        const name = await fetchName(d, context);
        cache.set(cacheKey(d, context), name);
      }),
    ).then(() => notify());
  }, [rawDigitsList.join(","), context?.groupJid, context?.sessionId]);

  const result: Record<string, string> = {};
  for (const raw of rawDigitsList) {
    const d = normalize(raw);
    const v = cache.get(cacheKey(d, context));
    result[raw] = v && typeof v === "string" ? v : formatPhone(d);
  }
  return result;
}
