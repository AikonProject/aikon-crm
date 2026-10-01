'use client';

import { useEffect, useState } from 'react';
import { Save, Loader2, Check, RefreshCw, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { PageHeader } from '@/components/layout/page-header';
import { toast } from 'sonner';
import Link from 'next/link';

type CredMap = Record<string, Record<string, string>>;

function SectionCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
    return (
        <div className="bg-white rounded-2xl border border-[#E8E8EC] shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E8E8EC]">
                <h3 className="text-[15px] font-semibold text-[#1A1A2E]">{title}</h3>
                <p className="text-[12px] text-[#9CA3AF] mt-0.5">{subtitle}</p>
            </div>
            <div className="p-6 space-y-4">{children}</div>
        </div>
    );
}

function FieldRow({ label, value, onChange, type = 'text', placeholder }: {
    label: string; value: string; onChange: (v: string) => void;
    type?: string; placeholder?: string;
}) {
    return (
        <div>
            <label className="block text-[13px] font-medium text-[#6B7280] mb-1.5">{label}</label>
            {type === 'textarea' ? (
                <textarea
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    rows={4}
                    placeholder={placeholder}
                    className="w-full px-3 py-2.5 text-[13px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8] resize-none font-mono"
                />
            ) : (
                <input
                    type={type}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className="w-full px-3 py-2.5 text-[13px] bg-white border border-[#E8E8EC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#818CF8]/20 focus:border-[#818CF8]"
                />
            )}
        </div>
    );
}

function SaveButton({ onClick, saving, saved }: { onClick: () => void; saving: boolean; saved: boolean }) {
    return (
        <Button onClick={onClick} disabled={saving} className="gap-2 rounded-xl bg-[#818CF8] hover:bg-[#6366F1] text-white mt-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
            {saved ? 'Guardado' : 'Guardar'}
        </Button>
    );
}

export default function IntegrationsClient() {
    const [creds, setCreds] = useState<CredMap>({});
    const [loading, setLoading] = useState(true);

    // WhatsApp
    const [wabaId, setWabaId] = useState('');
    const [phoneNumberId, setPhoneNumberId] = useState('');
    const [metaToken, setMetaToken] = useState('');
    const [webhookVerifyToken, setWebhookVerifyToken] = useState('');
    const [savingMeta, setSavingMeta] = useState(false);
    const [savedMeta, setSavedMeta] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncMsg, setSyncMsg] = useState('');

    // n8n
    const [n8nBaseUrl, setN8nBaseUrl] = useState('');
    const [sendMsgWebhook, setSendMsgWebhook] = useState('');
    const [botWebhook, setBotWebhook] = useState('');
    const [reservationWebhook, setReservationWebhook] = useState('');
    const [webhookSecret, setWebhookSecret] = useState('');
    const [savingN8n, setSavingN8n] = useState(false);
    const [savedN8n, setSavedN8n] = useState(false);
    const [testingN8n, setTestingN8n] = useState(false);
    const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);

    // Google Calendar
    const [calendarId, setCalendarId] = useState('');
    const [serviceAccountJson, setServiceAccountJson] = useState('');
    const [savingGcal, setSavingGcal] = useState(false);
    const [savedGcal, setSavedGcal] = useState(false);

    useEffect(() => {
        fetch('/api/settings/credentials')
            .then((r) => r.json())
            .then((d) => {
                const c: CredMap = d.credentials ?? {};
                setCreds(c);
                // WhatsApp
                setWabaId(c.whatsapp?.waba_id ?? '');
                setPhoneNumberId(c.whatsapp?.phone_number_id ?? '');
                setMetaToken(c.whatsapp?.meta_access_token ?? '');
                setWebhookVerifyToken(c.whatsapp?.webhook_verify_token ?? '');
                // n8n (flat column names from DB)
                const flat = c as unknown as Record<string, string>;
                setN8nBaseUrl(flat.n8n_base_url ?? '');
                setSendMsgWebhook(flat.n8n_send_message_webhook ?? '');
                setBotWebhook(flat.n8n_bot_webhook ?? '');
                setReservationWebhook(flat.n8n_reservation_webhook ?? '');
                setWebhookSecret(flat.n8n_webhook_secret ?? '');
                // Google Calendar
                setCalendarId(c.google_calendar?.calendar_id ?? '');
                setServiceAccountJson(c.google_calendar?.service_account_json ?? '');
            })
            .finally(() => setLoading(false));
    }, []);

    async function saveMeta() {
        setSavingMeta(true);
        try {
            const res = await fetch('/api/settings/credentials', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: 'whatsapp', credentials: { waba_id: wabaId, phone_number_id: phoneNumberId, meta_access_token: metaToken, webhook_verify_token: webhookVerifyToken } }),
            });
            if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error || 'Error al guardar credenciales de WhatsApp'); setSavingMeta(false); return; }
            setSavedMeta(true); setTimeout(() => setSavedMeta(false), 2500);
        } catch { toast.error('Error de conexión al guardar WhatsApp'); }
        setSavingMeta(false);
    }

    async function handleSync() {
        setSyncing(true); setSyncMsg('');
        const res = await fetch('/api/templates/sync', { method: 'POST' });
        const data = await res.json();
        setSyncMsg(res.ok ? `${data.synced} plantillas sincronizadas.` : (data.error ?? 'Error al sincronizar.'));
        setSyncing(false);
    }

    async function saveN8n() {
        setSavingN8n(true);
        try {
            const res = await fetch('/api/settings/credentials', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    n8n_base_url: n8nBaseUrl,
                    n8n_send_message_webhook: sendMsgWebhook,
                    n8n_bot_webhook: botWebhook,
                    n8n_reservation_webhook: reservationWebhook,
                    n8n_webhook_secret: webhookSecret,
                }),
            });
            if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error || 'Error al guardar configuración n8n'); setSavingN8n(false); return; }
            setSavedN8n(true); setTimeout(() => setSavedN8n(false), 2500);
        } catch { toast.error('Error de conexión al guardar n8n'); }
        setSavingN8n(false);
    }

    async function testN8n() {
        if (!n8nBaseUrl) return;
        setTestingN8n(true); setTestResult(null);
        try {
            const res = await fetch(n8nBaseUrl.replace(/\/$/, '') + '/healthz', { method: 'GET', signal: AbortSignal.timeout(5000) });
            setTestResult(res.ok ? 'ok' : 'fail');
        } catch {
            setTestResult('fail');
        }
        setTestingN8n(false);
    }

    async function saveGcal() {
        setSavingGcal(true);
        try {
            const res = await fetch('/api/settings/credentials', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: 'google_calendar', credentials: { calendar_id: calendarId, service_account_json: serviceAccountJson } }),
            });
            if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error || 'Error al guardar Google Calendar'); setSavingGcal(false); return; }
            setSavedGcal(true); setTimeout(() => setSavedGcal(false), 2500);
        } catch { toast.error('Error de conexión al guardar Google Calendar'); }
        setSavingGcal(false);
    }

    if (loading) return (
        <>
            <Breadcrumb />
            <PageHeader title="Integraciones" description="Configura las conexiones de tu restaurante" />
            <div className="p-8 text-center text-[#9CA3AF] text-[14px]">Cargando credenciales…</div>
        </>
    );

    return (
        <>
            <Breadcrumb />
            <PageHeader title="Integraciones" description="Configura las conexiones de tu restaurante" />

            <div className="max-w-2xl space-y-6">
                {/* WhatsApp / Meta — professional+ only */}
                {(
                    <SectionCard title="WhatsApp / Meta" subtitle="Conecta tu cuenta de WhatsApp Business para enviar mensajes y campañas">
                        <FieldRow label="WABA ID" value={wabaId} onChange={setWabaId} placeholder="123456789012345" />
                        <FieldRow label="Phone Number ID" value={phoneNumberId} onChange={setPhoneNumberId} placeholder="123456789012346" />
                        <FieldRow label="Meta Access Token" value={metaToken} onChange={setMetaToken} type="password" placeholder="EAA..." />
                        <FieldRow label="Webhook Verify Token" value={webhookVerifyToken} onChange={setWebhookVerifyToken} placeholder="mi_token_secreto" />
                        <div className="flex items-center gap-3 flex-wrap">
                            <SaveButton onClick={saveMeta} saving={savingMeta} saved={savedMeta} />
                            <Button
                                variant="outline"
                                onClick={handleSync}
                                disabled={syncing || !metaToken || !wabaId}
                                className="gap-2 rounded-xl border-[#E8E8EC] text-[#6B7280]"
                            >
                                {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                Sincronizar plantillas
                            </Button>
                            <Link href="/settings/templates" className="text-[13px] text-[#818CF8] hover:underline">
                                Ver plantillas →
                            </Link>
                        </div>
                        {syncMsg && (
                            <p className={`text-[12px] mt-1 ${syncMsg.startsWith('Error') ? 'text-[#DC2626]' : 'text-[#059669]'}`}>{syncMsg}</p>
                        )}
                    </SectionCard>
                )}

                <SectionCard
                    title="n8n"
                    subtitle="Automatización de workflows y mensajes del bot de IA"
                >
                    <FieldRow label="n8n Base URL" value={n8nBaseUrl} onChange={setN8nBaseUrl} placeholder="https://mi-n8n.ejemplo.com" />
                    <FieldRow label="Send Message Webhook URL" value={sendMsgWebhook} onChange={setSendMsgWebhook} placeholder="https://mi-n8n.ejemplo.com/webhook/..." />
                    <FieldRow label="Bot Webhook URL" value={botWebhook} onChange={setBotWebhook} placeholder="https://mi-n8n.ejemplo.com/webhook/..." />
                    <FieldRow label="Reservas Webhook URL" value={reservationWebhook} onChange={setReservationWebhook} placeholder="https://mi-n8n.ejemplo.com/webhook/reservas" />
                    <FieldRow label="Webhook Secret" value={webhookSecret} onChange={setWebhookSecret} type="password" placeholder="secreto compartido" />
                    <div className="flex items-center gap-3 flex-wrap">
                        <SaveButton onClick={saveN8n} saving={savingN8n} saved={savedN8n} />
                        <Button
                            variant="outline"
                            onClick={testN8n}
                            disabled={testingN8n || !n8nBaseUrl}
                            className="gap-2 rounded-xl border-[#E8E8EC] text-[#6B7280]"
                        >
                            {testingN8n ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
                            Probar conexión
                        </Button>
                        {testResult === 'ok' && <span className="text-[12px] text-[#059669] font-medium flex items-center gap-1"><Check size={13} /> Conectado</span>}
                        {testResult === 'fail' && <span className="text-[12px] text-[#DC2626] font-medium">No se pudo conectar</span>}
                    </div>
                </SectionCard>

                {/* Google Calendar — professional+ only */}
                {(
                    <SectionCard title="Google Calendar" subtitle="Sincroniza reservas con tu calendario de Google">
                        <FieldRow label="Calendar ID" value={calendarId} onChange={setCalendarId} placeholder="example@gmail.com" />
                        <FieldRow label="Service Account JSON" value={serviceAccountJson} onChange={setServiceAccountJson} type="textarea" placeholder='{"type": "service_account", ...}' />
                        <SaveButton onClick={saveGcal} saving={savingGcal} saved={savedGcal} />
                    </SectionCard>
                )}
            </div>
        </>
    );
}
