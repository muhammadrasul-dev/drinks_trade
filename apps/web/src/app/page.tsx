import { Locale } from '@drinks/shared';
import { Button } from '@drinks/ui/components/button';

// Placeholder home page for T-004; real routes and translated copy arrive with T-202/T-203.
// The locale list comes from @drinks/shared to prove the workspace package resolves (T-005).
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">drinks_trade</h1>
      <p className="text-muted-foreground text-sm">{Object.values(Locale).join(' / ')}</p>
      <Button>Button</Button>
    </main>
  );
}
