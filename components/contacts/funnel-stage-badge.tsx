interface FunnelStageBadgeProps {
    name: string;
    color: string | null;
    size?: 'sm' | 'md';
}

/**
 * Colored badge that reflects a funnel stage's configured color from the DB.
 * The color is applied at 15% opacity for the background and full opacity for text/dot.
 */
export function FunnelStageBadge({ name, color, size = 'md' }: FunnelStageBadgeProps) {
    const hex = color ?? '#818CF8';

    // Parse hex to rgb for rgba usage
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    const bgColor = `rgba(${r}, ${g}, ${b}, 0.15)`;
    const textColor = hex;

    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full font-medium ${
                size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[12px]'
            }`}
            style={{ backgroundColor: bgColor, color: textColor }}
        >
            <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: textColor }}
            />
            {name}
        </span>
    );
}
