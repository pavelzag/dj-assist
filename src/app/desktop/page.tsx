import AppShell from '../components/AppShell';
import ElectronClientInit from '../components/ElectronClientInit';

export default function DesktopPage() {
  return <AppShell platform="electron" clientInit={<ElectronClientInit />} />;
}
