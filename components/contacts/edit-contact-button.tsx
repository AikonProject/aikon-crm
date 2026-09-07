'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EditContactDialog } from '@/components/contacts/edit-contact-dialog';

type Contact = {
    id: string;
    nombre: string;
    email: string | null;
    wa_id: string | null;
    job_title?: string | null;
    source: string;
    funnel_stage_id: string | null;
    lead_score: number;
};

type Stage = {
    id: string;
    name: string;
    color: string | null;
};

type Props = {
    contact: Contact;
    stages: Stage[];
};

export function EditContactButton({ contact, stages }: Props) {
    const router = useRouter();
    const [open, setOpen] = useState(false);

    function handleSuccess() {
        router.refresh();
    }

    return (
        <>
            <Button
                size="sm"
                onClick={() => setOpen(true)}
                className="gap-1.5 rounded-[10px] bg-[#818CF8] hover:bg-[#6366F1] text-white"
            >
                <Pencil size={14} /> Editar
            </Button>

            <EditContactDialog
                open={open}
                onOpenChange={setOpen}
                contact={contact}
                stages={stages}
                onSuccess={handleSuccess}
            />
        </>
    );
}
