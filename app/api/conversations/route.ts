import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireModule } from '@/lib/tenant-plan';
import { TenantError } from '@/lib/tenant';
import type { ConversationStatus } from '@/lib/types/database';

export async function GET(request: NextRequest) {
    try {
        const supabase = createAdminClient();
    const TENANT_ID = await requireModule('chat');
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');

        let query = supabase
            .from('conversations')
            .select(`
                *,
                contact:contacts!conversations_contact_id_fkey(
                    id, nombre, wa_id, email, avatar_url,
                    funnel_stage_id,
                    funnel_stage:funnel_stages(id, name, color)
                )
            `)
            .eq('tenant_id', TENANT_ID)
            .order('last_message_at', { ascending: false });

        if (status && status !== 'all') {
            query = query.eq('status', status as ConversationStatus);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching conversations:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data ?? []);
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('Unexpected error in GET /api/conversations:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const supabase = createAdminClient();
    const TENANT_ID = await requireModule('chat');
        const body = await request.json();

        const { data, error } = await supabase
            .from('conversations')
            .insert({
                tenant_id: TENANT_ID,
                contact_id: body.contact_id,
                channel: body.channel ?? 'whatsapp',
                status: 'open' as ConversationStatus,
                unread_count: 0,
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data, { status: 201 });
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('Unexpected error in POST /api/conversations:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
