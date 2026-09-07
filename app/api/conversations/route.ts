import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MOCK_TENANT_ID } from '@/lib/mock-tenant';
import type { ConversationStatus } from '@/lib/types/database';

export async function GET(request: NextRequest) {
    try {
        const supabase = createAdminClient();
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');

        let query = supabase
            .from('conversations')
            .select(`
                *,
                contact:contacts(
                    id, nombre, wa_id, email, avatar_url,
                    funnel_stage_id,
                    funnel_stage:funnel_stages(id, name, color)
                )
            `)
            .eq('tenant_id', MOCK_TENANT_ID)
            .order('last_message_at', { ascending: false, nullsFirst: false });

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
        console.error('Unexpected error in GET /api/conversations:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const supabase = createAdminClient();
        const body = await request.json();

        const { data, error } = await supabase
            .from('conversations')
            .insert({
                tenant_id: MOCK_TENANT_ID,
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
        console.error('Unexpected error in POST /api/conversations:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
