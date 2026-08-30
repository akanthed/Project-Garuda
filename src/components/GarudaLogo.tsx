interface GarudaLogoProps {
  className?: string;
}

export function GarudaLogo({ className }: GarudaLogoProps) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}favicon.svg`}
      alt=""
      aria-hidden="true"
      className={className}
      data-logo-variant="wing"
      data-testid="garuda-logo"
    />
  );
}
