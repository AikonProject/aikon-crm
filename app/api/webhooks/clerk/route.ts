import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
    public_user_data: { user_id: string };
    role: string;
};

export async function POST(req: Request) {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
        return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    const headerPayload = await headers();
    const svixId = headerPayload.get('svix-id');
    const svixTimestamp = headerPayload.get('svix-timestamp');
    const svixSignature = headerPayload.get('svix-signature');

    if (!svixId || !svixTimestamp || !svixSignature) {
        return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 });
    }

    const payload = await req.text();

    let event: { type: string; data: unknown };
    try {
        const wh = new Webhook(secret);
        event = wh.verify(payload, {
            'svix-id': svixId,
            'svix-timestamp': svixTimestamp,
            'svix-signature': svixSignature,
        }) as unknown as { type: string; data: unknown };
    } catch {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { type, data } = event;

    try {
        // ── Organization created → create tenant ──────────────────────────
        if (type === 'organization.created') {
            const org = data as ClerkOrgEvent;
            const slug = org.slug ?? org.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            await supabase.from('tenants').upsert({
                clerk_org_id: org.id,
                name: org.name,
                slug,
                logo_url: org.image_url ?? null,
                plan: 'starter',
                is_active: true,
            }, { onConflict: 'clerk_org_id' });
        }

        // ── Organization updated → update tenant ──────────────────────────
        if (type === 'organization.updated') {
            const org = data as ClerkOrgEvent;
            await supabase.from('tenants')
                .update({ name: org.name, logo_url: org.image_url ?? null })
                .eq('clerk_org_id', org.id);
        }

        // ── User created / updated → upsert user ─────────────────────────
        if (type === 'user.created' || type === 'user.updated') {
            const user = data as ClerkUserEvent;
            const email = user.email_addresses[0]?.email_address ?? '';
            const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || email;

            // Check if super_admin
            if (user.public_metadata?.role === 'super_admin') {
                await supabase.from('super_admins').upsert({
                    clerk_user_id: user.id,
                    email,
                    name: fullName,
                    is_active: true,
                }, { onConflict: 'clerk_user_id' });
            }

            // Upsert user row — tenant_id and role are set later via membership events
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from('users') as any).upsert({
                clerk_user_id: user.id,
                email,
                full_name: fullName,
                avatar_url: user.image_url ?? null,
                tenant_id: null,
                role: 'agent',
                is_active: true,
            }, { onConflict: 'clerk_user_id' });
        }

        // ── Membership created → link user to tenant with role ────────────
        if (type === 'organizationMembership.created' || type === 'organizationMembership.updated') {
            const membership = data as ClerkMembershipEvent;
            const clerkOrgId = membership.organization.id;
            const clerkUserId = membership.public_user_data.user_id;
            const role = membership.role === 'org:admin' ? 'admin' : 'agent';

            // Get tenant UUID from org
            const { data: tenant } = await supabase
                .from('tenants')
                .select('id')
                .eq('clerk_org_id', clerkOrgId)
                .single();

            if (tenant) {
                // Use upsert so this works even if user.created event was missed
                const { data: existingUser } = await supabase
                    .from('users')
                    .select('id, email')
                    .eq('clerk_user_id', clerkUserId)
                    .maybeSingle();

                if (existingUser) {
                    await supabase.from('users')
                        .update({ tenant_id: tenant.id, role, is_active: true })
                        .eq('clerk_user_id', clerkUserId);
                } else {
                    // Fallback: user.created was missed — insert minimal row
                    await supabase.from('users').insert({
                        clerk_user_id: clerkUserId,
                        tenant_id: tenant.id,
                        email: `${clerkUserId}@pending.clerk`,
                        full_name: clerkUserId,
                        role,
                        is_active: true,
                    });
                }
            }
        }

        // ── Membership deleted → deactivate user ──────────────────────────
        if (type === 'organizationMembership.deleted') {
            const membership = data as ClerkMembershipEvent;
            await supabase.from('users')
                .update({ is_active: false })
                .eq('clerk_user_id', membership.public_user_data.user_id);
        }

        return NextResponse.json({ received: true });
    } catch (err) {
        console.error('[Clerk Webhook]', type, err);
        return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
    }
}
