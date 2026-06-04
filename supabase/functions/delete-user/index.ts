import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get calling user
    const { data: { user: callerUser }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !callerUser) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get request body
    const { userId } = await req.json();
    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing userId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if caller is admin
    const { data: callerData, error: callerError } = await supabaseAdmin
      .from("users")
      .select("organization_id, role")
      .eq("id", callerUser.id)
      .single();

    if (callerError || !callerData) {
      return new Response(
        JSON.stringify({ success: false, error: "Caller not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (callerData.role !== "admin" && callerData.role !== "super_admin") {
      return new Response(
        JSON.stringify({ success: false, error: "Only admins can delete users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get target user
    const { data: targetUser, error: targetError } = await supabaseAdmin
      .from("users")
      .select("organization_id, role, name, email")
      .eq("id", userId)
      .single();

    if (targetError || !targetUser) {
      return new Response(
        JSON.stringify({ success: false, error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify same organization (unless super_admin)
    if (callerData.role !== "super_admin" && targetUser.organization_id !== callerData.organization_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Cannot delete users from another organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prevent self-deletion
    if (userId === callerUser.id) {
      return new Response(
        JSON.stringify({ success: false, error: "Cannot delete yourself" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prevent deleting super_admin (unless you are super_admin)
    if (targetUser.role === "super_admin" && callerData.role !== "super_admin") {
      return new Response(
        JSON.stringify({ success: false, error: "Cannot delete super admin" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Deleting user ${userId} (${targetUser.email}) by ${callerUser.id}`);

    // Clear references in tables that don't have CASCADE/SET NULL
    // Set NULL for soft references
    await supabaseAdmin.from("lead_tasks").update({ done_by: null }).eq("done_by", userId);
    await supabaseAdmin.from("leads").update({ assigned_user_id: null }).eq("assigned_user_id", userId);
    await supabaseAdmin.from("properties").update({ corretor_id: null }).eq("corretor_id", userId);
    await supabaseAdmin.from("activities").update({ user_id: null }).eq("user_id", userId);
    await supabaseAdmin.from("whatsapp_sessions").update({ owner_user_id: null }).eq("owner_user_id", userId);
    await supabaseAdmin.from("whatsapp_session_access").update({ granted_by: null }).eq("granted_by", userId);
    await supabaseAdmin.from("whatsapp_message_templates").update({ created_by: null }).eq("created_by", userId);
    await supabaseAdmin.from("invitations").update({ created_by: null }).eq("created_by", userId);
    await supabaseAdmin.from("telecom_customers").update({ seller_id: null }).eq("seller_id", userId);

    // Remove from membership / pivot tables
    await supabaseAdmin.from("team_members").delete().eq("user_id", userId);
    await supabaseAdmin.from("round_robin_members").delete().eq("user_id", userId);
    await supabaseAdmin.from("whatsapp_session_access").delete().eq("user_id", userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    await supabaseAdmin.from("organization_members").delete().eq("user_id", userId);

    // Delete from public.users (this should cascade user_roles)
    const { error: deletePublicError } = await supabaseAdmin
      .from("users")
      .delete()
      .eq("id", userId);

    if (deletePublicError) {
      console.error("Error deleting from public.users:", deletePublicError);
      return new Response(
        JSON.stringify({ success: false, error: deletePublicError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete from auth.users
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      console.error("Error deleting from auth.users:", deleteAuthError);
      // User was removed from public.users but not auth - this is still a partial success
      return new Response(
        JSON.stringify({ 
          success: true, 
          warning: "User removed from organization but auth account may persist",
          error: deleteAuthError.message 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully deleted user ${userId}`);

    return new Response(
      JSON.stringify({ success: true, deletedUserId: userId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Delete user error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
