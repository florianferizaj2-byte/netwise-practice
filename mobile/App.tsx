import { AppShell } from './src/navigation/AppShell';
import { ThemeProvider } from './src/theme';
import { AppAlertHost } from './src/components/AppAlert';
import { PlatformSupport } from './src/components/PlatformSupport';
import { LaunchAnnouncement } from './src/components/LaunchAnnouncement';

export default function App() {
  return (
    <ThemeProvider>
      <PlatformSupport />
      <LaunchAnnouncement><AppShell /></LaunchAnnouncement>
      <AppAlertHost />
    </ThemeProvider>
  );
}
