import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireModule } from '@/lib/tenant-plan';
import { TenantError } from '@/lib/tenant';
import type { ButtonAction } from '@/lib/types/database';

/** PATCH /api/templates/[id]  { button_actions } — what each quick-reply button does. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const TENANT_ID = await requireModule('chat');
        const body = await req.json().catch(() => null);
        const raw = body?.button_actions;
        if (!raw || typeof raw !== 'object') return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });

        // Keep only known keys, drop empty actions
        const actions: Record<string, ButtonAction> = {};
        for (const [label, a] of Object.entries(raw as Record<string, ButtonAction>)) {
            const clean: ButtonAction = {
                reply: typeof a?.reply === 'string' && a.reply.trim() ? a.reply.trim().slice(0, 4096) : null,
                tag_ids: Array.isArray(a?.tag_ids) ? a.tag_ids.filter((x) => typeof x === 'string') : [],
                stage_id: typeof a?.stage_id === 'string' && a.stage_id ? a.stage_id : null,
                ai: a?.ai === 'on' || a?.ai === 'off' ? a.ai : null,
                assign_to: typeof a?.assign_to === 'string' && a.assign_to ? a.assign_to : null,
            };
            if (clean.reply || clean.tag_ids?.length || clean.stage_id || clean.ai || clean.assign_to) actions[label] = clean;
        }

        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from('message_templates')
            .update({ button_actions: actions } as Record<string, unknown>)
            .eq('id', id)
            .eq('tenant_id', TENANT_ID)
            .select()
            .maybeSingle();
        if (error) {
            console.error('[PATCH /api/templates/[id]]', error);
            return NextResponse.json({ error: 'No se pudieron guardar las respuestas.' }, { status: 500 });
        }
        if (!data) return NextResponse.json({ error: 'Plantilla no encontrada.' }, { status: 404 });
        return NextResponse.json({ template: data });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('[PATCH /api/templates/[id]] unexpected', err);
        return NextResponse.json({ error: 'Error interno' }, { status: 500 });
    }
}
