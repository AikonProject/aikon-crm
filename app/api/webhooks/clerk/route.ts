import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { mapClerkOrgRole, provisionTenant } from '@/lib/tenant';

type ClerkUserEvent = {
    id: string;
    email_addresses: { email_address: string; id: string }[];
    first_name: string | null;
    last_name: string | null;
    image_url: string | null;
    phone_numbers: { phone_number: string }[];
    public_metadata: { role?: string };
};

type ClerkOrgEvent = {
    id: string;
    name: string;
    slug: string | null;
    image_url: string | null;
};

type ClerkMembershipEvent = {
    organization: { id: string };
    public_user_data: {
        user_id: string;
        identifier?: string;
        first_name?: string | null;
        last_name?: string | null;
        image_url?: string | null;
    };
    role: string;
};

// Health-check — lets you confirm the route is reachable without auth
export async function GET() {
    return NextResponse.json({ ok: true, ts: new Date().toISOString() });
}

export async function POST(req: Request) {
    console.log('[Clerk Webhook] POST received');

    try {
        // ── 1. Verify secret is configured ───────────────────────────────
        const secret = process.env.CLERK_WEBHOOK_SECRET;
        if (!secret) {
            console.error('[Clerk Webhook] CLERK_WEBHOOK_SECRET is not set');
            return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
        }
        console.log('[Clerk Webhook] secret ok');

        // ── 2. Read svix headers ──────────────────────────────────────────
        const headerPayload = await headers();
        const svixId        = headerPayload.get('svix-id');
        const svixTimestamp = headerPayload.get('svix-timestamp');
        const svixSignature = headerPayload.get('svix-signature');

        if (!svixId || !svixTimestamp || !svixSignature) {
            console.error('[Clerk Webhook] Missing svix headers', { svixId, svixTimestamp, svixSignature });
            return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 });
        }
        console.log('[Clerk Webhook] svix headers present');

        // ── 3. Read body & verify signature ──────────────────────────────
        const payload = await req.text();
        console.log('[Clerk Webhook] payload length:', payload.length);

        let event: { type: string; data: unknown };
        try {
                        // svix v2: verify() only throws on a bad signature and returns
            // nothing, so the event is parsed from the raw payload afterwards
            const wh = new Webhook(secret);
            wh.verify(payload, {
                'svix-id':        svixId,
                'svix-timestamp': svixTimestamp,
                'svix-signature': svixSignature,
            });
            event = JSON.parse(payload) as { type: string; data: unknown };
        } catch (err) {
            console.error('[Clerk Webhook] Signature verification failed:', err);
            return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
        }

        const { type, data } = event;
        console.log('[Clerk Webhook] verified event type:', type);

        // ── 4. Init Supabase admin client ─────────────────────────────────
        const supabase = createAdminClient();

        // ── 5. Handle events ──────────────────────────────────────────────

        // Organization created → create (and seed) the tenant
        if (type === 'organization.created') {
            const org = data as ClerkOrgEvent;
            console.log('[Clerk Webhook] organization.created:', org.id);
            await provisionTenant(org.id);
        }

        // Organization updated → update tenant
        if (type === 'organization.updated') {
            const org = data as ClerkOrgEvent;
            console.log('[Clerk Webhook] organization.updated:', org.id);

            const { error } = await supabase.from('tenants')
                .update({ name: org.name, logo_url: org.image_url ?? null })
                .eq('clerk_org_id', org.id);

            if (error) console.error('[Clerk Webhook] tenants update error:', error);
        }

        // User created / updated → refresh profile on every tenant membership
        if (type === 'user.created' || type === 'user.updated') {
            const user     = data as ClerkUserEvent;
            const email    = user.email_addresses[0]?.email_address ?? '';
            const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || email;
            console.log('[Clerk Webhook]', type, ':', user.id);

            // Super admin check
            if (user.public_metadata?.role === 'super_admin') {
                const { error } = await supabase.from('super_admins').upsert({
                    clerk_user_id: user.id,
                    email,
                    name:      fullName,
                    is_active: true,
                }, { onConflict: 'clerk_user_id' });
                if (error) console.error('[Clerk Webhook] super_admins upsert error:', error);
            }

            // Membership rows are created by organizationMembership events
            const { error } = await supabase.from('users')
                .update({ email, full_name: fullName, avatar_url: user.image_url ?? null })
                .eq('clerk_user_id', user.id);
            if (error) console.error('[Clerk Webhook] users update error:', error);
        }

        // User deleted → deactivate every membership
        if (type === 'user.deleted') {
            const user = data as { id: string };
            const { error } = await supabase.from('users')
                .update({ is_active: false })
                .eq('clerk_user_id', user.id);
            if (error) console.error('[Clerk Webhook] users deactivate error:', error);
        }

        // Membership created/updated → link user to tenant (one row per tenant)
        if (type === 'organizationMembership.created' || type === 'organizationMembership.updated') {
            const membership  = data as ClerkMembershipEvent;
            const clerkOrgId  = membership.organization.id;
            const userData    = membership.public_user_data;
            const role        = mapClerkOrgRole(membership.role);
            console.log('[Clerk Webhook]', type, ': org', clerkOrgId, 'user', userData.user_id, 'role', role);

            const tenantId = await provisionTenant(clerkOrgId);
            const email    = userData.identifier ?? '';
            const fullName = [userData.first_name, userData.last_name].filter(Boolean).join(' ') || email || userData.user_id;

            const { error } = await supabase.from('users').upsert({
                clerk_user_id: userData.user_id,
                tenant_id:     tenantId,
                email,
                full_name:     fullName,
                avatar_url:    userData.image_url ?? null,
                role,
                is_active:     true,
            }, { onConflict: 'clerk_user_id,tenant_id' });
            if (error) console.error('[Clerk Webhook] users upsert error:', error);
        }

        // Membership deleted → deactivate the user in that tenant only
        if (type === 'organizationMembership.deleted') {
            const membership = data as ClerkMembershipEvent;
            console.log('[Clerk Webhook] organizationMembership.deleted:', membership.public_user_data.user_id);

            const { data: tenant } = await supabase
                .from('tenants')
                .select('id')
                .eq('clerk_org_id', membership.organization.id)
                .maybeSingle();

            if (tenant) {
                const { error } = await supabase.from('users')
                    .update({ is_active: false })
                    .eq('clerk_user_id', membership.public_user_data.user_id)
                    .eq('tenant_id', tenant.id);
                if (error) console.error('[Clerk Webhook] users deactivate error:', error);
            }
        }

        console.log('[Clerk Webhook] done:', type);
        return NextResponse.json({ received: true });

    } catch (err) {
        console.error('[Clerk Webhook] Unhandled error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
