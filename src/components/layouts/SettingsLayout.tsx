import { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFromScreen } from "@/hooks/useFromScreen";

interface SettingsLayoutProps {
  title: string;
  children: ReactNode;
}

/**
 * Reusable layout for settings pages with back button and title.
 */
const SettingsLayout = ({ title, children }: SettingsLayoutProps) => {
  const { navigateBack } = useFromScreen();

  const handleBack = () => {
    navigateBack("/settings");
  };

  return (
    <div className="min-h-screen bg-background text-foreground py-16 px-6 relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={handleBack}
        className="absolute top-6 left-6 text-muted-foreground hover:bg-transparent opacity-60 hover:opacity-100 transition-opacity h-14 w-14"
      >
        <ArrowLeft className="w-6 h-6" />
      </Button>

      <div className="max-w-md mx-auto space-y-8 text-center">
        <h1 className="text-5xl md:text-6xl font-serif text-foreground mb-4 tracking-tight">{title}</h1>
        {children}
      </div>
    </div>
  );
};

export default SettingsLayout;
