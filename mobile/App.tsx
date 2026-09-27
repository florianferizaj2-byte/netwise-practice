import { AppShell } from './src/navigation/AppShell';
import { ThemeProvider } from './src/theme';
import { AppAlertHost } from './src/components/AppAlert';
import { PlatformSupport } from './src/components/PlatformSupport';

export default function App() {
  return (
    <ThemeProvider>
      <PlatformSupport />
      <AppShell />
      <AppAlertHost />
    </ThemeProvider>
  );
}
