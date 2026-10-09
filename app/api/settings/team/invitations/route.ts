import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerTenantId, isSuperAdmin, TenantError } from '@/lib/tenant';
import { getTenantConfig } from '@/lib/tenant-plan';

// ============================================================
// Team invitations — backed by Clerk organization invitations.
// Clerk sends the email; on accept, the membership webhook (or the
// user's first visit) creates the users row.
// ============================================================

/** Only org admins (or super admins) can manage invitations. */
async function requireOrgAdmin() {
    const { userId, orgId, orgRole } = await auth();
    if (!userId || !orgId) throw new TenantError('No hay una organización activa.', 401);
    const isAdmin = orgRole === 'org:admin' || await isSuperAdmin();
    if (!isAdmin) throw new TenantError('Solo los administradores pueden gestionar invitaciones.', 403);
    return { userId, orgId };
}

function errorResponse(err: unknown, context: string) {
    if (err instanceof TenantError) return NextResponse.json({ error: err.message }, { status: err.status });
    // Clerk API errors carry a list of { message, longMessage }
    const clerkMessage = (err as { errors?: { longMessage?: string; message?: string }[] })?.errors?.[0];
    if (clerkMessage) {
        return NextResponse.json({ error: clerkMessage.longMessage ?? clerkMessage.message }, { status: 422 });
    }
    console.error(context, err);
    return NextResponse.json({ error: 'Error al gestionar la invitación' }, { status: 500 });
}

export async function GET() {
    try {
        const { orgId } = await requireOrgAdmin();
        const clerk = await clerkClient();
        const { data } = await clerk.organizations.getOrganizationInvitationList({
            organizationId: orgId,
            status: ['pending'],
            limit: 100,
        });
        return NextResponse.json({
            invitations: data.map((inv) => ({
                id: inv.id,
                email: inv.emailAddress,
                role: inv.role === 'org:admin' ? 'admin' : 'agent',
                created_at: new Date(inv.createdAt).toISOString(),
            })),
        });
    } catch (err) {
        return errorResponse(err, '[GET /api/settings/team/invitations]');
    }
}

export async function POST(req: NextRequest) {
    try {
        const { userId, orgId } = await requireOrgAdmin();
        const body = await req.json().catch(() => ({}));
        const email = String(body.email ?? '').trim().toLowerCase();
        const role = body.role === 'admin' ? 'org:admin' : 'org:member';

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return NextResponse.json({ error: 'Email inválido.' }, { status: 400 });
        }

        // Respect the plan's user limit (active members + pending invitations)
        const tenantId = await getServerTenantId();
        const config = await getTenantConfig(tenantId);
        const clerk = await clerkClient();
        const supabase = createAdminClient();
        const [{ count: activeUsers }, pending] = await Promise.all([
            supabase.from('users').select('id', { count: 'exact', head: true })
                .eq('tenant_id', tenantId).eq('is_active', true),
            clerk.organizations.getOrganizationInvitationList({ organizationId: orgId, status: ['pending'], limit: 100 }),
        ]);
        if ((activeUsers ?? 0) + pending.totalCount >= config.maxUsers) {
            return NextResponse.json(
                { error: `Tu plan permite hasta ${config.maxUsers} usuarios (incluyendo invitaciones pendientes).` },
                { status: 403 }
            );
        }

        const invitation = await clerk.organizations.createOrganizationInvitation({
            organizationId: orgId,
            inviterUserId: userId,
            emailAddress: email,
            role,
            redirectUrl: `${req.nextUrl.origin}/sign-up`,
        });

        return NextResponse.json({
            invitation: {
                id: invitation.id,
                email: invitation.emailAddress,
                role: invitation.role === 'org:admin' ? 'admin' : 'agent',
                created_at: new Date(invitation.createdAt).toISOString(),
            },
        }, { status: 201 });
    } catch (err) {
        return errorResponse(err, '[POST /api/settings/team/invitations]');
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const { userId, orgId } = await requireOrgAdmin();
        const invitationId = req.nextUrl.searchParams.get('id');
        if (!invitationId) return NextResponse.json({ error: 'Falta el id de la invitación.' }, { status: 400 });

        const clerk = await clerkClient();
        await clerk.organizations.revokeOrganizationInvitation({
            organizationId: orgId,
            invitationId,
            requestingUserId: userId,
        });
        return NextResponse.json({ revoked: true });
    } catch (err) {
        return errorResponse(err, '[DELETE /api/settings/team/invitations]');
    }
}
