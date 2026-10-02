import { cn } from "@/lib/utils";

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "max-w-2xl",
        align === "center" && "mx-auto text-center",
        className,
      )}
    >
      {eyebrow ? (
        <p className="text-brand-600 text-sm font-semibold tracking-wide uppercase">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="text-foreground mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="text-muted-foreground mt-4 text-lg">{description}</p>
      ) : null}
    </div>
  );
}
