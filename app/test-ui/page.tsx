// throwaway page — verify shadcn Button is blue and dark mode toggle works
// remove this page before Phase 8
"use client";

import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Moon, Sun } from "lucide-react";

export default function TestUiPage() {
  const { theme, setTheme } = useTheme();

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-foreground">Phase 0 — UI check</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Primary button should be bright blue. Dark mode toggle should work.
          </p>

          {/* primary CTA — should be bright blue (blue-600) */}
          <Button className="w-full">Send email</Button>

          {/* ghost variant */}
          <Button variant="ghost" className="w-full">
            Discard chat
          </Button>

          {/* badge */}
          <div className="flex gap-2">
            <Badge>Casual · ~95 words</Badge>
            <Badge variant="secondary">Professional</Badge>
            <Badge variant="outline">Efficient</Badge>
          </div>

          {/* dark mode toggle */}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? (
              <Sun className="mr-2 h-4 w-4" />
            ) : (
              <Moon className="mr-2 h-4 w-4" />
            )}
            Toggle dark mode (currently: {theme})
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
