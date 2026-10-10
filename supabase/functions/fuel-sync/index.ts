// Supabase Edge Function: fuel-sync
// Deploy only after reviewing SECURITY_IMPLEMENTATION_PLAN.md.
// Required function secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// The service-role key must never be copied into index.html or any browser bundle.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function normalizeRecords(value: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > 50000) return null;
  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    if (typeof row._syncId !== "string" || !row._syncId || row._syncId.length > 200) return null;
    if (seen.has(row._syncId)) return null;
    seen.add(row._syncId);
    rows.push(row);
  }
  return rows;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return "{" + Object.keys(obj).sort().map(k => JSON.stringify(k) + ":" + stableJson(obj[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

function mapById(rows: Record<string, unknown>[]) {
  return new Map(rows.map(row => [String(row._syncId), row]));
}

// A restricted user may append new business records only. They may not change or
// remove an existing row, create tombstones, or write app-level settings.
function validateAddOnly(incoming: Record<string, unknown>[], remote: Record<string, unknown>[]) {
  const before = mapById(remote);
  for (const row of incoming) {
    const old = before.get(String(row._syncId));
    // Legacy snapshots may still contain an unchanged admin-password setting or
    // previously synchronized tombstone. Allow identical legacy entries during
    // the transition, but never let an add-only user create or change them.
    if (old && stableJson(old) === stableJson(row)) continue;
    if (row._appSetting || row._deleted === true) {
      return "Add-only accounts cannot change application settings or delete records.";
    }
    if (old) return "Add-only accounts cannot edit existing records.";
    if (typeof row.sn !== "number" || !Number.isFinite(row.sn)) {
      return "New records must contain a valid record number.";
    }
  }
  // Incoming snapshots can omit rows that are remote-only; omissions are not deletions.
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed." });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return reply(500, { error: "Server configuration is incomplete." });

  const authHeader = req.headers.get("Authorization") || "";
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) return reply(401, { error: "Authentication required." });

  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${tokenMatch[1]}` } },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(tokenMatch[1]);
  if (authError || !authData.user) return reply(401, { error: "Session is invalid or expired." });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: permissions, error: permissionError } = await admin
    .from("app_user_permissions")
    .select("can_read,can_add,can_edit,can_delete,can_manage_users")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (permissionError) return reply(500, { error: "Unable to verify account permissions." });
  if (!permissions) return reply(403, { error: "No application permissions are assigned to this account." });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "Request body must be valid JSON." });
  }
  const action = body.action;
  if (action === "manage_users") {
    if (permissions.can_manage_users !== true) {
      return reply(403, { error: "Administrator permission is required to manage users." });
    }
    const operation = body.operation;

    const readFlags = () => ({
      can_read: body.can_read === true,
      can_add: body.can_add === true,
      can_edit: body.can_edit === true,
      can_delete: body.can_delete === true,
      can_manage_users: body.can_manage_users === true,
    });
    const validFlags = (flags: Record<string, boolean>) =>
      !flags.can_manage_users || (flags.can_read && flags.can_add && flags.can_edit && flags.can_delete);

    if (operation === "list") {
      const allUsers: Array<{ id: string; email?: string }> = [];
      for (let page = 1; page <= 50; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) return reply(500, { error: "Unable to list accounts." });
        const users = data.users || [];
        allUsers.push(...users.map(user => ({ id: user.id, email: user.email || undefined })));
        if (users.length < 1000) break;
      }
      const { data: rows, error } = await admin.from("app_user_permissions")
        .select("user_id,can_read,can_add,can_edit,can_delete,can_manage_users");
      if (error) return reply(500, { error: "Unable to load user permissions." });
      const byUser = new Map((rows || []).map(row => [row.user_id, row]));
      return reply(200, {
        users: allUsers.map(user => ({
          ...user,
          permissions: byUser.get(user.id) || null,
        })).sort((a, b) => (a.email || "").localeCompare(b.email || "")),
      });
    }

    if (operation !== "invite_or_assign") {
      return reply(400, { error: "Unsupported user-management operation." });
    }
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return reply(400, { error: "Enter a valid email address." });
    }
    const flags = readFlags();
    if (!validFlags(flags)) {
      return reply(400, { error: "An administrator account must have read, add, edit, and delete permissions." });
    }

    let targetUser: { id: string; email?: string } | null = null;
    for (let page = 1; page <= 50 && !targetUser; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) return reply(500, { error: "Unable to verify the target account." });
      const found = (data.users || []).find(user => (user.email || "").toLowerCase() === email);
      if (found) targetUser = { id: found.id, email: found.email || email };
      if ((data.users || []).length < 1000) break;
    }

    let invited = false;
    if (!targetUser) {
      // Existing accounts are never re-invited or password-reset here. Only a
      // genuinely new email receives an invitation to establish its credentials.
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
      if (error || !data.user) return reply(400, { error: error?.message || "Unable to invite this account." });
      targetUser = { id: data.user.id, email: data.user.email || email };
      invited = true;
    }
    if (targetUser.id === authData.user.id) {
      return reply(400, { error: "For safety, an administrator cannot change their own permissions here." });
    }

    const { error: saveError } = await admin.from("app_user_permissions").upsert({
      user_id: targetUser.id,
      ...flags,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (saveError) return reply(500, {
      error: invited
        ? "The invitation was sent, but permissions could not be saved. The new account has no application access until an administrator assigns permissions."
        : "Unable to save account permissions.",
    });
    return reply(200, {
      ok: true,
      invited,
      user: { id: targetUser.id, email: targetUser.email },
      permissions: flags,
    });
  }

  if (action === "read") {
    if (!permissions.can_read) return reply(403, { error: "Read permission is required." });
    const { data, error } = await admin.from("fuel_shared_state")
      .select("records,updated_at").eq("id", "shared").maybeSingle();
    if (error) return reply(500, { error: "Unable to load shared records." });
    if (!data) return reply(200, { data: null, permissions });
    // Legacy admin-password settings may still exist in the old shared row.
    // Never return those secrets to any browser session.
    const safeRecords = Array.isArray(data.records)
      ? data.records.filter((row: unknown) => !!row && typeof row === "object"
          && !(row as Record<string, unknown>)._appSetting)
      : [];
    return reply(200, { data: { ...data, records: safeRecords }, permissions });
  }

  if (action !== "sync") return reply(400, { error: "Unsupported action." });
  if (!permissions.can_read) return reply(403, { error: "Read permission is required for synchronization." });
  if (!permissions.can_add && !permissions.can_edit && !permissions.can_delete) {
    return reply(403, { error: "This account has no write permission." });
  }

  const incoming = normalizeRecords(body.records);
  if (!incoming) return reply(400, { error: "Records payload is invalid or too large." });

  // Optimistic concurrency protects concurrent clients from blindly overwriting
  // one another. Client must retry after a conflict by reading and merging again.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: remote, error: readError } = await admin.from("fuel_shared_state")
      .select("records,updated_at").eq("id", "shared").maybeSingle();
    if (readError) return reply(500, { error: "Unable to read the current shared snapshot." });
    const remoteRecords = normalizeRecords(remote?.records ?? []);
    if (!remoteRecords) return reply(500, { error: "The current shared snapshot is invalid; no data was changed." });

    // The legacy adminPassword setting is local-only during this migration. It
    // must never be written through the record-sync API, even by an administrator.
    if (incoming.some(row => row._appSetting === "adminPassword" || row._appSetting)) {
      return reply(403, { error: "Application settings cannot be changed through record synchronization." });
    }

    // Never replace the remote snapshot with a stale client snapshot. Merge by
    // sync ID, retain remote-only rows, and enforce the precise operation on every
    // changed item. Omitted rows are not deletions; explicit tombstones are.
    // Drop legacy app-level settings from the next authorized write. They are
    // not business records and must not remain part of the shared snapshot.
    const merged = new Map(remoteRecords
      .filter(row => !row._appSetting)
      .map(row => [String(row._syncId), row]));
    for (const row of incoming) {
      const id = String(row._syncId);
      const old = merged.get(id);
      if (old && stableJson(old) === stableJson(row)) continue;

      if (row._deleted === true) {
        if (!permissions.can_delete) return reply(403, { error: "Delete permission is required." });
        merged.delete(id);
        // Keep a tombstone in the shared snapshot so stale devices cannot
        // reintroduce the deleted record on their next sync.
        merged.set(id, row);
      } else if (!old || old._deleted === true) {
        if (!permissions.can_add) return reply(403, { error: "Add permission is required." });
        if (typeof row.sn !== "number" || !Number.isFinite(row.sn)) {
          return reply(400, { error: "New records must contain a valid record number." });
        }
        merged.set(id, row);
      } else {
        if (!permissions.can_edit) return reply(403, { error: "Edit permission is required." });
        merged.set(id, row);
      }
    }

    const updated = Array.from(merged.values());
    const timestamp = new Date().toISOString();
    let writeQuery = admin.from("fuel_shared_state");
    if (!remote) {
      const { error: insertError } = await writeQuery.insert({
        id: "shared", records: updated, updated_at: timestamp,
      });
      if (!insertError) return reply(200, { data: { records: updated, updated_at: timestamp } });
      if (/duplicate|unique|already exists/i.test(insertError.message || "")) continue;
      return reply(500, { error: "Unable to create the shared snapshot." });
    }

    const { data: saved, error: updateError } = await writeQuery
      .update({ records: updated, updated_at: timestamp })
      .eq("id", "shared")
      .eq("updated_at", remote.updated_at)
      .select("updated_at")
      .maybeSingle();
    if (updateError) return reply(500, { error: "Unable to save the shared snapshot." });
    if (saved) return reply(200, { data: { records: updated, updated_at: saved.updated_at } });
  }

  return reply(409, { error: "Shared data changed repeatedly. Read the latest snapshot and retry." });
});
