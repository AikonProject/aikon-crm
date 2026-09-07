interface PageHeaderProps {
    title: string;
    description?: string;
    children?: React.ReactNode;
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
                <h1 className="crm-page-title">{title}</h1>
                {description && (
                    <p className="crm-page-description mt-1">{description}</p>
                )}
            </div>
            {children && <div className="flex items-center gap-3">{children}</div>}
        </div>
    );
}
