// Supabase Edge Function: fuel-sync
// Deploy only after reviewing SECURITY_IMPLEMENTATION_PLAN.md.
// Required function secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// The service-role key must never be copied into index.html or any browser bundle.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";

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

function auditBusiness(record: Record<string, unknown> | null) {
  if (!record) return null;
  return Object.fromEntries(Object.entries(record).filter(([key]) => !key.startsWith('_') && !['sn','dayVal','kmDay','difference'].includes(key)));
}
function makeAuditEvents(incoming: Record<string, unknown>[], remote: Record<string, unknown>[], pending: Record<string, unknown>[], actor: {id:string;email?:string}) {
  const events: Record<string, unknown>[]=[];
  const before=mapById(remote);
  for(const row of incoming) {
    const id=String(row._syncId),old=before.get(id);
    const parts=pending.filter(e=>e.record_id===id);
    if(parts.length) {
      let cursor=auditBusiness(old || null);
      for(const part of parts) {
        if(part.actor_id!==actor.id) throw Error('Pending audit history belongs to another account. Sign in with the account that made these changes.');
        if(stableJson(part.before)!==stableJson(cursor)) throw Error('Audit history conflicts with the current record. Preserve the local copy and reopen the record.');
        const reason=typeof part.reason==='string'?part.reason.trim():'';
        if(!reason || reason.length>500 || typeof part.event_id!=='string' || part.event_id.length>200 || (part.after!==null && (typeof part.after!=='object' || Array.isArray(part.after)))) throw Error('A valid edit reason and audit entry are required.');
        events.push({event_id:part.event_id,record_id:id,record_sn:row.sn || old?.sn || part.record_sn,operation:part.after===null?'delete':cursor?'update':'create',actor_id:actor.id,actor_email:actor.email || actor.id,actor_name:typeof part.actor_name==='string'?part.actor_name.trim().slice(0,80):null,client_at:String(part.client_at||'').slice(0,60),device_id:String(part.device_id||'').slice(0,200),device_name:String(part.device_name||'').slice(0,80),reason,before_data:cursor,after_data:part.after});
        cursor=part.after as Record<string, unknown>;
      }
      if(stableJson(cursor)!==stableJson(row._deleted===true?null:auditBusiness(row))) throw Error('Audit history does not match the submitted record. No changes were saved.');
    } else if (!old || stableJson(auditBusiness(old))!==stableJson(auditBusiness(row)) || row._deleted===true && old._deleted!==true) {
      if(old && row._deleted!==true) throw Error('An edit reason and audit history are required. Open the current application version before editing.');
      events.push({event_id:crypto.randomUUID(),record_id:id,record_sn:row.sn || old?.sn,operation:row._deleted===true?'delete':'create',actor_id:actor.id,actor_email:actor.email || actor.id,actor_name:null,client_at:row._syncUpdatedAt,device_id:'not-supplied',device_name:'Not supplied by client',reason:row._deleted===true?'Authorized deletion':'Record creation / import',before_data:auditBusiness(old || null),after_data:row._deleted===true?null:auditBusiness(row)});
    }
  }
  if(pending.some(e=>!incoming.some(row=>row._syncId===e.record_id))) throw Error('Audit entries must be synchronized with their matching records.');
  return events;
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
      const byUser = new Map((rows || []).map(row => [row.user_id, row] as const));
      return reply(200, {
        users: allUsers.map(user => ({
          ...user,
          permissions: byUser.get(user.id) || null,
        })).sort((a, b) => (a.email || "").localeCompare(b.email || "")),
      });
    }

    if (operation === "password_reset_status" || operation === "reset_password") {
      // The administrator cannot supply an arbitrary redirect URL or password.
      // Configure and allow-list the hosted recovery page on the server first.
      const configured = Deno.env.get("FUEL_PASSWORD_RESET_REDIRECT_URL") || "";
      let redirect: URL | null = null;
      try {
        const candidate = new URL(configured);
        if (candidate.protocol === "https:" && !candidate.username && !candidate.password
          && candidate.pathname.endsWith("/password-reset.html") && !candidate.search && !candidate.hash) redirect = candidate;
      } catch (_) { /* Not configured: fail before sending any email. */ }
      if (operation === "password_reset_status") return reply(200, { ready: !!redirect });
      if (!redirect) return reply(503, { error: "Password reset is not configured. Host password-reset.html and configure the approved recovery URL before sending email." });
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return reply(400, { error: "Enter a valid email address." });
      let exists = false;
      for (let page = 1; page <= 50 && !exists; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) return reply(500, { error: "Unable to verify the target account." });
        exists = (data.users || []).some(user => (user.email || "").toLowerCase() === email);
        if ((data.users || []).length < 1000) break;
      }
      if (!exists) return reply(404, { error: "Account not found. Invite the new user first." });
      // Only the public project URL/anon key reach the browser. Never use the
      // service-role key in a redirect, email, response, or browser page.
      redirect.searchParams.set("project_url", url);
      redirect.searchParams.set("public_key", anonKey);
      const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo: redirect.toString() });
      if (error) {
        const providerCode = typeof error.code === "string" && /^[a-z0-9_]{1,80}$/.test(error.code) ? error.code : "unknown";
        return reply(error.status === 429 ? 429 : 400, {
          error: error.status === 429
            ? "Password reset email was not sent: Supabase rate limit reached. Stop retrying until the limit resets. Check Auth rate limits and configure custom SMTP for regular use."
            : "Unable to send the password reset email. Check email delivery configuration.",
          provider_code: providerCode,
        });
      }
      return reply(200, { ok: true, reset_email_sent: true });
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

  if(action === "audit") {
    if(!permissions.can_read) return reply(403,{error:"Read permission is required."});
    const id=typeof body.record_id==='string'?body.record_id:'';
    if(!id || id.length>200) return reply(400,{error:"Invalid record identity."});
    const offset=Number.isSafeInteger(body.offset) && Number(body.offset)>=0 ? Number(body.offset) : 0;
    const {data,error}=await admin.from('fuel_record_audit').select('*').eq('record_id',id).order('confirmed_at',{ascending:false}).order('event_sequence',{ascending:false}).range(offset,offset+49);
    if(error) return reply(500,{error:"Unable to load audit history."});
    return reply(200,{events:data || []});
  }
  if (action === "read") {
    if (!permissions.can_read) return reply(403, { error: "Read permission is required." });
    const { data, error } = await admin.from("fuel_shared_state")
      .select("records,updated_at").eq("id", "shared").maybeSingle();
    if (error) return reply(500, { error: "Unable to load shared records." });
    if (!data) return reply(200, { data: null, permissions, actor:{id:authData.user.id,email:authData.user.email} });
    // Legacy admin-password settings may still exist in the old shared row.
    // Never return those secrets to any browser session.
    const safeRecords = Array.isArray(data.records)
      ? data.records.filter((row: unknown) => !!row && typeof row === "object"
          && !(row as Record<string, unknown>)._appSetting)
      : [];
    return reply(200, { data: { ...data, records: safeRecords }, permissions, actor:{id:authData.user.id,email:authData.user.email} });
  }

  if (action !== "sync") return reply(400, { error: "Unsupported action." });
  if (!permissions.can_read) return reply(403, { error: "Read permission is required for synchronization." });
  if (!permissions.can_add && !permissions.can_edit && !permissions.can_delete) {
    return reply(403, { error: "This account has no write permission." });
  }

  const incoming = normalizeRecords(body.records);
  if (!incoming) return reply(400, { error: "Records payload is invalid or too large." });

  const journal=Array.isArray(body.audit_events)?body.audit_events as Record<string,unknown>[]:[];
  if(journal.length>50000 || journal.some(e=>!e || typeof e!=='object' || typeof e.event_id!=='string')) return reply(400,{error:"Invalid or oversized audit journal."});
  const journalIds=journal.map(e=>String(e.event_id));
  if(new Set(journalIds).size!==journalIds.length) return reply(400,{error:"Duplicate audit event identity."});
  let acknowledged: string[]=[];
  if(journalIds.length) {
    for(let offset=0;offset<journalIds.length;offset+=100) {
    const {data,error}=await admin.from('fuel_record_audit').select('event_id,actor_id,record_id').in('event_id',journalIds.slice(offset,offset+100));
    if(error) return reply(500,{error:"Unable to verify pending audit history."});
    if((data || []).some(e=>e.actor_id!==authData.user.id || !journal.some(j=>j.event_id===e.event_id && j.record_id===e.record_id))) return reply(403,{error:"Audit identity belongs to another account or record."});
    acknowledged.push(...(data || []).map(e=>e.event_id));
    }
  }
  const pendingJournal=journal.filter(e=>!acknowledged.includes(String(e.event_id)));

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

      // Tombstones are permanent for a sync ID. Check this before timestamp
      // comparison so a clock-skewed device cannot resurrect deleted records.
      if (old && old._deleted === true && row._deleted !== true) {
        return reply(409, { error: "A deleted record ID cannot be reused. Create a new record with a new sync ID." });
      }

      // Reject delayed writes to a newer server version. A complete snapshot
      // can contain older *unchanged* rows: clients must resolve them before
      // sending rather than silently overwriting server state.
      if (old) {
        const oldTime = Date.parse(String(old._syncUpdatedAt || ""));
        const newTime = Date.parse(String(row._syncUpdatedAt || ""));
        if (!Number.isFinite(newTime) || (Number.isFinite(oldTime) && newTime <= oldTime)) {
          return reply(409, { error: "Stale record version. Refresh cloud data and preserve the local change." });
        }
      }

      if (row._deleted === true) {
        // A deletion is only valid for a record that actually existed. An
        // unknown tombstone must not become a way to create arbitrary state.
        if (!old) {
          const chain=pendingJournal.filter(e=>e.record_id===id);
          if(!permissions.can_add || !chain.length || chain[0].before!==null || chain[chain.length-1].after!==null) return reply(409,{error:"Cannot delete an unknown record ID."});
        }
        if (!permissions.can_delete) return reply(403, { error: "Delete permission is required." });
        merged.delete(id);
        // Keep a tombstone in the shared snapshot so stale devices cannot
        // reintroduce the deleted record on their next sync.
        merged.set(id, row);
      } else if (old && old._deleted === true) {
        return reply(409, { error: "A deleted record ID cannot be reused. Create a new record with a new sync ID." });
      } else if (!old) {
        if (!permissions.can_add) return reply(403, { error: "Add permission is required." });
        const recordNumber = Number(row.sn);
        if (!Number.isFinite(recordNumber) || !Number.isInteger(recordNumber) || recordNumber <= 0) {
          return reply(400, { error: "New records must contain a valid record number." });
        }
        const duplicateNumber = remoteRecords.some(existing =>
          existing._deleted !== true
          && String(existing._syncId) !== id
          && Number(existing.sn) === recordNumber
        );
        if (duplicateNumber) {
          return reply(409, { error: "Record number conflict. Read the latest snapshot and retry." });
        }
        merged.set(id, row);
      } else {
        if (!permissions.can_edit) return reply(403, { error: "Edit permission is required." });
        const recordNumber = Number(row.sn);
        const duplicateNumber = Number.isFinite(recordNumber) && remoteRecords.some(existing =>
          existing._deleted !== true
          && String(existing._syncId) !== id
          && Number(existing.sn) === recordNumber
        );
        if (duplicateNumber) {
          return reply(409, { error: "Record number conflict. Read the latest snapshot and retry." });
        }
        merged.set(id, row);
      }
    }

    let auditEvents: Record<string,unknown>[];
    try {auditEvents=makeAuditEvents(incoming,remoteRecords,pendingJournal,authData.user);} catch(error){return reply(409,{error:(error as Error).message});}
    const updated = Array.from(merged.values());
    // A no-op sync must not rewrite the shared row or advance its revision.
    // This also lets add-only users safely submit an unchanged snapshot.
    const previousBusinessRecords = remoteRecords.filter(row => !row._appSetting);
    const sameSnapshot = updated.length === previousBusinessRecords.length
      && updated.every(row => {
        const previous = previousBusinessRecords.find(old => old._syncId === row._syncId);
        return previous && stableJson(previous) === stableJson(row);
      });
    if (sameSnapshot && remote && !auditEvents.length) {
      return reply(200, { data: { records: updated, updated_at: remote.updated_at }, audit_ack:acknowledged });
    }
    const numbers = new Set<number>();
    for (const row of updated) {
      if (row._deleted === true) continue;
      const sn = Number(row.sn);
      if (!Number.isSafeInteger(sn) || sn <= 0 || numbers.has(sn)) {
        return reply(409, { error: "Duplicate or invalid record number in merged snapshot." });
      }
      numbers.add(sn);
    }
    const {data:saved,error:commitError}=await admin.rpc('fuel_commit_audited_snapshot',{p_expected:remote?.updated_at || null,p_records:updated,p_events:auditEvents});
    if(commitError) return reply(500,{error:"Unable to commit records and their audit history. No changes were saved."});
    if(saved) return reply(200,{data:{records:updated,updated_at:saved.updated_at},audit_ack:[...acknowledged,...auditEvents.map(e=>e.event_id)]});

  }

  return reply(409, { error: "Shared data changed repeatedly. Read the latest snapshot and retry." });
});
