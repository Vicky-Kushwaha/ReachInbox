import { colorFor, initialsFor } from "@/lib/format";

export default function Avatar({
  name,
  src,
  size = 36,
}: {
  name: string;
  src?: string | null;
  size?: number;
}) {
  const style = { width: size, height: size };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} className="rounded-full object-cover" style={style} />;
  }
  return (
    <div
      className={`flex items-center justify-center rounded-full font-semibold text-white ${colorFor(name)}`}
      style={{ ...style, fontSize: size * 0.4 }}
    >
      {initialsFor(name)}
    </div>
  );
}
