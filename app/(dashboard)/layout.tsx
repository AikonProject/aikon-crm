import { Sidebar } from '@/components/layout/sidebar';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-[#F8F8FA]">
            <Sidebar />
            <main className="lg:ml-[260px] min-h-screen">
                <div className="p-6 lg:p-8 pt-16 lg:pt-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
