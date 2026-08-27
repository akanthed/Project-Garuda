import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface SectionHelpProps {
  title: string;
  description: string;
}

export function SectionHelp({ title, description }: SectionHelpProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={title}
          aria-label={title}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-foreground/10 text-muted-foreground transition hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(20rem,calc(100vw-2rem))] border-foreground/10 bg-background/95 p-4 backdrop-blur-sm">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </PopoverContent>
    </Popover>
  );
}