
import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Local fallback for testing environment if Deno.env is empty
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://iemalzlfnbouobyjwlwi.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("SUPABASE_SERVICE_ROLE_KEY is not set in environment");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || "missing-key");

const TEST_ORG_ID = "818394bf-8c57-445e-be2f-b964c2569235";
const TEST_USER_ID = "6a343e57-590c-42e3-b73f-bb572b31917f";
const TEST_EVENT = "new_lead_received";

Deno.test("Notification Deduplication Test", async () => {
  if (!SUPABASE_SERVICE_ROLE_KEY) return;
  
  const payload = {
    event_key: TEST_EVENT,
    organization_id: TEST_ORG_ID,
    user_id: TEST_USER_ID,
    variables: { lead_name: "Test Lead" },
    dedupe_key: `test_dedupe_${Date.now()}`
  };

  // 1. First call - should succeed
  const resp1 = await fetch(`${SUPABASE_URL}/functions/v1/notification-dispatcher`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  const data1 = await resp1.json();
  assertEquals(data1.success, true, "First call should succeed");
  assertEquals(data1.deduplicated, undefined, "First call should not be deduplicated");

  // 2. Second call - should be deduplicated
  const resp2 = await fetch(`${SUPABASE_URL}/functions/v1/notification-dispatcher`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  const data2 = await resp2.json();
  assertEquals(data2.success, true, "Second call should return success true");
  assertEquals(data2.deduplicated, true, "Second call should be deduplicated");
  
  console.log("Deduplication test passed!");
});

Deno.test("Multi-channel Notification Test", async () => {
  if (!SUPABASE_SERVICE_ROLE_KEY) return;
  
  // Create or Update a template to have multiple channels
  const tempSlug = `multi_channel_test_${Date.now()}`;
  
  const { data: template, error: createError } = await supabase
    .from('notification_templates')
    .insert({
      name: "Multi-channel Test",
      slug: tempSlug,
      event_key: tempSlug,
      message: "Test message for {name}",
      channels: ["system", "email"],
      category: "test",
      is_active: true,
      dedupe_window_seconds: 60
    })
    .select()
    .single();

  if (createError) throw createError;

  try {
    const payload = {
      event_key: tempSlug,
      organization_id: TEST_ORG_ID,
      user_id: TEST_USER_ID,
      recipient: "test@example.com",
      variables: { name: "Tester" },
      is_test: true 
    };

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/notification-dispatcher`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();
    assertEquals(data.success, true, "Multi-channel dispatch should succeed");
    assertEquals(data.results.length, 2, "Should have 2 channel results");
    
    const systemResult = data.results.find((r: any) => r.channel === 'system');
    const emailResult = data.results.find((r: any) => r.channel === 'email');
    
    assertEquals(systemResult?.result?.success, true, "System channel should succeed");
    console.log("Multi-channel results:", data.results);
  } finally {
    // Cleanup
    await supabase.from('notification_templates').delete().eq('id', template.id);
  }
  
  console.log("Multi-channel test passed!");
});
