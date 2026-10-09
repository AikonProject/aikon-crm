import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireModule } from '@/lib/tenant-plan';
import { TenantError } from '@/lib/tenant';
import { logActivity } from '@/lib/activity';

// ---------------------------------------------------------------------------
// PATCH /api/conversations/[id] — update conversation fields
// ---------------------------------------------------------------------------
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createAdminClient();
        const TENANT_ID = await requireModule('chat');
        const body = await request.json();

        const allowedFields: Record<string, boolean> = {
            assigned_to: true,
            status: true,
        };

        const updates: Record<string, unknown> = {};
        for (const key of Object.keys(body)) {
            if (allowedFields[key]) {
                updates[key] = body[key];
            }
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('conversations')
            .update(updates)
            .eq('id', id)
            .eq('tenant_id', TENANT_ID)
            .select('*, contact:contacts ( id, nombre, wa_id, email, funnel_stage_id, funnel_stage:funnel_stages ( id, name, color ) )')
            .single();

        if (error) {
            console.error('[PATCH /api/conversations/[id]]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const STATUS_LABELS: Record<string, string> = {
            open: 'Reabrió la conversación', resolved: 'Marcó la conversación como resuelta',
            pending: 'Marcó la conversación como pendiente', snoozed: 'Pospuso la conversación',
        };
        const row = data as { contact_id: string };
        if (updates.status) {
            await logActivity(supabase, {
                tenantId: TENANT_ID, contactId: row.contact_id, type: 'status_changed',
                description: STATUS_LABELS[updates.status as string] ?? `Cambió el estado a ${updates.status}`,
            });
        }
        if ('assigned_to' in updates) {
            let assignee = 'nadie';
            if (updates.assigned_to) {
                const { data: user } = await supabase.from('users').select('full_name')
                    .eq('id', updates.assigned_to as string).eq('tenant_id', TENANT_ID).maybeSingle();
                assignee = user?.full_name ?? 'un agente';
            }
            await logActivity(supabase, {
                tenantId: TENANT_ID, contactId: row.contact_id, type: 'assigned',
                description: updates.assigned_to ? `Asignó la conversación a ${assignee}` : 'Quitó la asignación',
            });
        }

        return NextResponse.json(data);
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[PATCH /api/conversations/[id]] unexpected', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
