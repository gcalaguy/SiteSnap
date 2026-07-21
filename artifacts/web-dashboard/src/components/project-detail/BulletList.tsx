import { bulletizeText } from "@/lib/bulletize";

export function BulletList({ text, className }: { text: string | null | undefined; className?: string }) {
  const items = bulletizeText(text);
  if (items.length === 0) return null;

  if (items.length === 1) {
    return <p className={className}>{items[0]}</p>;
  }

  return (
    <ul className={`list-disc pl-4 space-y-0.5 ${className ?? ""}`}>
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
