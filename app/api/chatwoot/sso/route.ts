import { NextResponse } from 'next/server';

export async function GET() {
    const baseUrl = process.env.CHATWOOT_BASE_URL;
    const platformToken = process.env.CHATWOOT_PLATFORM_ACCESS_TOKEN;
    const userId = process.env.CHATWOOT_USER_ID;

    if (!baseUrl || !platformToken || !userId) {
        return NextResponse.json({ error: 'Configuración incompleta: Faltan variables de entorno CHATWOOT_BASE_URL, CHATWOOT_PLATFORM_ACCESS_TOKEN o CHATWOOT_USER_ID' }, { status: 500 });
    }

    try {
        const cleanBaseUrl = baseUrl.replace(/\/$/, "");

        // Llamada a la Platform API de Chatwoot para generar el token SSO y la URL de auto-login
        const response = await fetch(`${cleanBaseUrl}/platform/api/v1/users/${userId}/login`, {
            method: 'GET',
            headers: {
                'api_access_token': platformToken
            }
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('Chatwoot SSO API Error:', errorData);
            return NextResponse.json({ error: 'El servidor de Chatwoot rechazó la autenticación API' }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json({ url: data.url });
    } catch (error) {
        console.error('Fallo en fetch interno para SSO:', error);
        return NextResponse.json({ error: 'Error del sistema al generar SSO' }, { status: 500 });
    }
}
