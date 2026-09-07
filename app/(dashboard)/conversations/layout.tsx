/**
 * Conversations layout — overrides the dashboard padding wrapper so the
 * chat page can fill the full available viewport without extra whitespace.
 *
 * The parent dashboard layout renders:
 *   <main className="lg:ml-[260px] min-h-screen">
 *     <div className="p-6 lg:p-8 pt-16 lg:pt-8">   ← we need to escape this
 *       {children}
 *     </div>
 *   </main>
 *
 * We use a negative-margin technique to cancel the parent padding so the
 * conversations page itself can use position:fixed to fill the viewport.
 * The page itself is position:fixed inset-0 lg:left-[260px], so this
 * wrapper only needs to exist; its size does not matter.
 */
export default function ConversationsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="-m-6 lg:-m-8 -mt-16 lg:-mt-8 overflow-hidden">
            {children}
        </div>
    );
}
