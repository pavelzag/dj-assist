import AppShell from './components/AppShell';
import ElectronClientInit from './components/ElectronClientInit';

export default function Page() {
  return <AppShell clientInit={<ElectronClientInit />} />;
}
