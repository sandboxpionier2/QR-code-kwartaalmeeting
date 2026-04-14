export function RubberDuck({
  className = "w-8 h-8",
  src = "/duck.png",
}: {
  className?: string;
  src?: string;
}) {
  return (
    <img
      src={src}
      alt="GEIS Duck"
      className={`object-contain drop-shadow-lg ${className}`}
    />
  );
}
