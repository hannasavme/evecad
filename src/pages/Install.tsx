import { useState, useEffect } from "react";
import { Download, CheckCircle, Smartphone, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const Install = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(isIOSDevice);

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    window.addEventListener("appinstalled", () => setIsInstalled(true));

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <img src="/pwa-192x192.png" alt="EveCAD" className="w-24 h-24 mx-auto rounded-2xl shadow-lg" />
        <h1 className="text-3xl font-bold text-foreground">Install EveCAD</h1>
        <p className="text-muted-foreground">
          Install EveCAD on your device for the best experience — works offline, loads instantly.
        </p>

        {isInstalled ? (
          <div className="flex items-center justify-center gap-2 text-green-500">
            <CheckCircle className="w-6 h-6" />
            <span className="text-lg font-medium">Already installed!</span>
          </div>
        ) : deferredPrompt ? (
          <Button onClick={handleInstall} size="lg" className="w-full gap-2">
            <Download className="w-5 h-5" />
            Install EveCAD
          </Button>
        ) : isIOS ? (
          <div className="bg-muted rounded-lg p-4 text-left space-y-2">
            <p className="font-medium text-foreground flex items-center gap-2">
              <Smartphone className="w-5 h-5" /> iOS Installation
            </p>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal pl-5">
              <li>Tap the <strong>Share</strong> button in Safari</li>
              <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
              <li>Tap <strong>Add</strong> to confirm</li>
            </ol>
          </div>
        ) : (
          <div className="bg-muted rounded-lg p-4 text-left space-y-2">
            <p className="font-medium text-foreground flex items-center gap-2">
              <Monitor className="w-5 h-5" /> Desktop / Android
            </p>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal pl-5">
              <li>Open in Chrome or Edge</li>
              <li>Click the install icon in the address bar</li>
              <li>Or use browser menu → <strong>Install app</strong></li>
            </ol>
          </div>
        )}

        <a href="/" className="text-sm text-primary hover:underline block">← Back to EveCAD</a>
      </div>
    </div>
  );
};

export default Install;
