import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireModule } from '@/lib/tenant-plan';
import { TenantError } from '@/lib/tenant';

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createAdminClient();
    const TENANT_ID = await requireModule('chat');
        const body = await request.json();

        if (typeof body.ai_enabled !== 'boolean') {
            return NextResponse.json(
                { error: 'ai_enabled (boolean) is required' },
                { status: 400 }
            );
        }

        const { data, error } = await supabase
            .from('conversations')
            .update({ ai_enabled: body.ai_enabled } as Record<string, unknown>)
            .eq('id', id)
            .eq('tenant_id', TENANT_ID)
            .select()
            .single();

        if (error) {
            console.error('Error toggling ai_enabled:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (err) {
        if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
        console.error('Unexpected error in PATCH /api/conversations/[id]/ai-toggle:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
