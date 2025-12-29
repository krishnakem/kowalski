import { ReactNode } from "react";
import { useFromScreen } from "@/hooks/useFromScreen";
import PageHeader from "./PageHeader";

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
      <PageHeader title={title} onBack={handleBack} />

      <div className="max-w-md mx-auto space-y-8 text-center">
        {children}
      </div>
    </div>
  );
};

export default SettingsLayout;
